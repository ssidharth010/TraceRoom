import "dotenv/config";

const DASHBOARD_NAME = "TraceRoom / Submission Evidence";
const CHANNEL_NAME = "TraceRoom Local Webhook";
const ALERT_NAMES = [
  "TraceRoom / Evidence Integrity Block",
  "TraceRoom / Uncontrolled Agent Failure",
  "TraceRoom / Session Cost Threshold",
];
const searchContext =
  "Create or verify the TraceRoom hackathon submission dashboard and alerts.";

if (!process.env.SIGNOZ_API_KEY) {
  throw new Error("SIGNOZ_API_KEY is required.");
}

const client = await createMcpClient();
const dashboard = await ensureDashboard(client);
const channel = await ensureNotificationChannel(client);
const alerts = await ensureAlerts(client, channel.name);

console.log(
  JSON.stringify(
    {
      dashboard,
      alerts,
      env: {
        SIGNOZ_DASHBOARD_URL: localizeUrl(dashboard.webUrl),
        SIGNOZ_ALERT_URLS: alerts
          .map((alert) => localizeUrl(alert.webUrl))
          .filter(Boolean)
          .join(","),
      },
    },
    null,
    2,
  ),
);

async function ensureDashboard(mcp) {
  const existing = structured(
    await mcp.call("signoz_list_dashboards", { limit: 100 }),
  ).data?.find((item) => item.name === DASHBOARD_NAME);
  if (existing) return existing;

  const result = structured(
    await mcp.call("signoz_create_dashboard", dashboardDefinition()),
  );
  const created = result.data ?? result;
  return {
    name: DASHBOARD_NAME,
    uuid: created.id ?? created.uuid,
    webUrl: created.webUrl,
  };
}

async function ensureNotificationChannel(mcp) {
  const existing = structured(
    await mcp.call("signoz_list_notification_channels", { limit: 100 }),
  ).data?.find((item) => item.name === CHANNEL_NAME);
  if (existing) return existing;

  const result = structured(
    await mcp.call("signoz_create_notification_channel", {
      type: "webhook",
      name: CHANNEL_NAME,
      webhook_url:
        process.env.SIGNOZ_BOOTSTRAP_WEBHOOK_URL ??
        "http://host.docker.internal:8787/signoz/alerts/webhook",
      send_resolved: true,
    }),
  );
  return { name: CHANNEL_NAME, ...(result.data ?? result) };
}

async function ensureAlerts(mcp, channelName) {
  const current =
    structured(await mcp.call("signoz_list_alert_rules", { limit: 100 }))
      .data ?? [];
  const definitions = alertDefinitions(channelName);

  for (const definition of definitions) {
    const existing = current.find(
      (alert) => alert.alert === definition.alert,
    );
    if (!existing) {
      await mcp.call("signoz_create_alert", definition);
    } else {
      await mcp.call("signoz_update_alert", {
        id: existing.ruleId ?? existing.id,
        ...definition,
      });
    }
  }

  const refreshed =
    structured(await mcp.call("signoz_list_alert_rules", { limit: 100 }))
      .data ?? [];
  return refreshed.filter((alert) =>
    ALERT_NAMES.includes(alert.alert ?? alert.name),
  );
}

function dashboardDefinition() {
  const widgets = [
    valueWidget(
      "session-outcomes",
      "Recorded sessions",
      "count()",
      "name = 'debate.session'",
    ),
    valueWidget(
      "evidence-blocks",
      "Evidence blocks",
      "count()",
      "name = 'debate.session' AND pipeline.block_reason = 'EVIDENCE_INTEGRITY' AND pipeline.short_circuited = true",
    ),
    valueWidget(
      "workflow-failures",
      "Workflow failures",
      "count()",
      "name = 'debate.session' AND outcome = 'ERROR'",
    ),
    valueWidget(
      "session-cost",
      "Total LLM cost",
      "sum(llm.cost_usd)",
      "llm.cost_usd EXISTS",
      "usd",
    ),
    groupedWidget(
      "outcomes-by-scenario",
      "Session outcomes by scenario",
      "bar",
      ["traceroom.scenario", "decision.outcome"],
      "name = 'debate.session'",
      ["{{traceroom.scenario}}", "{{decision.outcome}}"].join(" / "),
    ),
    groupedWidget(
      "llm-latency-by-agent",
      "LLM p95 latency by agent",
      "graph",
      ["agent.name"],
      "llm.latency_ms EXISTS",
      "{{agent.name}}",
      "p95(llm.latency_ms)",
      "ms",
    ),
    tableWidget(
      "llm-usage-by-agent",
      "LLM calls, tokens, and cost by agent",
      [
        "count()",
        "sum(gen_ai.usage.input_tokens)",
        "sum(gen_ai.usage.output_tokens)",
        "sum(llm.cost_usd)",
      ],
      ["agent.name"],
      "llm.cost_usd EXISTS",
    ),
    tableWidget(
      "risk-and-deadlocks",
      "Triggered risk rules and deadlocks",
      ["count()"],
      ["traceroom.scenario", "risk.review.status", "risk.triggered_rule_ids"],
      "name = 'debate.session' AND (risk.triggered_rule_count > 0 OR risk.review.status = 'DEADLOCKED')",
    ),
    groupedWidget(
      "decision-regret",
      "Decision regret and completed evaluations",
      "graph",
      ["market.symbol"],
      "eval.decision_regret_pct EXISTS",
      "{{market.symbol}}",
      "avg(eval.decision_regret_pct)",
      "percent",
    ),
  ];

  return {
    title: DASHBOARD_NAME,
    description:
      "Submission-grade evidence for TraceRoom decision outcomes, evidence blocks, LLM usage, risk controls, failures, and evaluation regret.",
    tags: ["traceroom", "ai-agents", "submission"],
    layout: widgets.map((widget, index) => {
      const firstRow = index < 4;
      const wideIndex = index - 4;
      return {
        I: widget.id,
        X: firstRow ? index * 3 : wideIndex % 2 === 0 ? 0 : 6,
        Y: firstRow ? 0 : 3 + Math.floor(wideIndex / 2) * 7,
        W: firstRow ? 3 : 6,
        H: firstRow ? 3 : 7,
        MinW: firstRow ? 2 : 4,
        MinH: firstRow ? 2 : 5,
        static: false,
        isDraggable: false,
      };
    }),
    widgets,
  };
}

function baseWidget(id, title, panelTypes, query, yAxisUnit = "none") {
  return {
    id,
    panelTypes,
    title,
    description: title,
    query,
    yAxisUnit,
    selectedLogFields: [],
    selectedTracesFields: [],
    thresholds: [],
    contextLinks: { linksData: [] },
    timePreferance: "GLOBAL_TIME",
  };
}

function builderQuery(aggregations, filter, groupBy = [], legend) {
  return {
    queryType: "builder",
    promql: [],
    clickhouse_sql: [],
    builder: {
      queryData: [
        {
          queryName: "A",
          dataSource: "traces",
          expression: "A",
          disabled: false,
          stepInterval: null,
          aggregations: aggregations.map((expression) => ({ expression })),
          filter: { expression: filter },
          groupBy: groupBy.map((key) => ({
            key,
            dataType: "string",
            type: "tag",
          })),
          ...(legend ? { legend } : {}),
          limit: 100,
          orderBy: [
            {
              columnName: aggregations[0],
              order: "desc",
            },
          ],
        },
      ],
      queryFormulas: [],
    },
  };
}

function valueWidget(id, title, aggregation, filter, unit) {
  return baseWidget(
    id,
    title,
    "value",
    builderQuery([aggregation], filter),
    unit,
  );
}

function groupedWidget(
  id,
  title,
  panel,
  groupBy,
  filter,
  legend,
  aggregation = "count()",
  unit,
) {
  return baseWidget(
    id,
    title,
    panel,
    builderQuery([aggregation], filter, groupBy, legend),
    unit,
  );
}

function tableWidget(id, title, aggregations, groupBy, filter) {
  return baseWidget(
    id,
    title,
    "table",
    builderQuery(aggregations, filter, groupBy),
  );
}

function alertDefinitions(channelName) {
  const costThreshold = Number(
    process.env.TRACEROOM_DEMO_COST_ALERT_USD ??
      process.env.SESSION_COST_ALERT_THRESHOLD_USD ??
      0.05,
  );
  return [
    traceAlert(
      ALERT_NAMES[0],
      "Any evidence-integrity block must page the demo operator.",
      "name = 'debate.session' AND pipeline.block_reason = 'EVIDENCE_INTEGRITY' AND pipeline.short_circuited = true",
      "count()",
      0,
      channelName,
      "critical",
    ),
    traceAlert(
      ALERT_NAMES[1],
      "Detect uncontrolled workflow or LLM failures.",
      "has_error = true AND scenario.injected = false",
      "count()",
      0,
      channelName,
      "critical",
    ),
    traceAlert(
      ALERT_NAMES[2],
      "Detect sessions whose accumulated LLM cost exceeds the demo threshold.",
      "llm.cost_usd EXISTS",
      "sum(llm.cost_usd)",
      costThreshold,
      channelName,
      "warning",
    ),
  ];
}

function traceAlert(
  alert,
  description,
  filter,
  aggregation,
  target,
  channel,
  severity,
) {
  return {
    alert,
    alertType: "TRACES_BASED_ALERT",
    description,
    ruleType: "threshold_rule",
    version: "v5",
    schemaVersion: "v2alpha1",
    condition: {
      compositeQuery: {
        queryType: "builder",
        panelType: "graph",
        queries: [
          {
            type: "builder_query",
            spec: {
              name: "A",
              signal: "traces",
              stepInterval: 60,
              aggregations: [{ expression: aggregation }],
              limit: 100,
              order: [
                {
                  key: { name: aggregation },
                  direction: "desc",
                },
              ],
              filter: { expression: filter },
              groupBy: [],
            },
          },
        ],
      },
      selectedQueryName: "A",
      thresholds: {
        kind: "basic",
        spec: [
          {
            name: severity,
            op: "above",
            matchType: "at_least_once",
            target,
            channels: [channel],
          },
        ],
      },
    },
    evaluation: {
      kind: "rolling",
      spec: { evalWindow: "5m", frequency: "15s" },
    },
    notificationSettings: {
      groupBy: [],
      renotify: {
        enabled: true,
        interval: "30m",
        alertStates: ["firing"],
      },
    },
    labels: { severity, product: "traceroom" },
    annotations: {
      description,
      summary: `${alert}: value {{$value}} crossed {{$threshold}}`,
    },
  };
}

async function createMcpClient() {
  const url = process.env.SIGNOZ_MCP_URL ?? "http://localhost:8000/mcp";
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version":
      process.env.SIGNOZ_MCP_PROTOCOL_VERSION ?? "2025-06-18",
    "SIGNOZ-API-KEY": process.env.SIGNOZ_API_KEY,
  };
  let sessionId = null;

  async function rpc(method, params, notification = false) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...headers,
        ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        ...(!notification ? { id: crypto.randomUUID() } : {}),
        method,
        params,
      }),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${method} failed (${response.status}): ${text}`);
    }
    sessionId = response.headers.get("mcp-session-id") ?? sessionId;
    if (notification || response.status === 202 || !text) return null;
    const payload = parseMcpPayload(text);
    if (payload.error) throw new Error(payload.error.message);
    return payload.result;
  }

  await rpc("initialize", {
    protocolVersion: headers["MCP-Protocol-Version"],
    capabilities: {},
    clientInfo: { name: "traceroom-signoz-bootstrap", version: "1.0.0" },
  });
  await rpc("notifications/initialized", {}, true);

  return {
    call: async (name, argumentsValue) => {
      const result = await rpc("tools/call", {
        name,
        arguments: { ...argumentsValue, searchContext },
      });
      if (result?.isError) {
        throw new Error(extractText(result));
      }
      return result;
    },
  };
}

function structured(result) {
  return (
    result?.structuredContent ??
    JSON.parse(result?.content?.find((item) => item.type === "text")?.text ?? "{}")
  );
}

function extractText(result) {
  return (
    result?.content
      ?.filter((item) => item.type === "text")
      .map((item) => item.text)
      .join(" ") ?? JSON.stringify(result)
  );
}

function parseMcpPayload(text) {
  const data = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((line) => line && line !== "[DONE]");
  return JSON.parse(data.at(-1) ?? text);
}

function localizeUrl(url) {
  if (!url) return "";
  return url.replace(/^http:\/\/signoz-signoz-0:8080/, "http://localhost:8080");
}
