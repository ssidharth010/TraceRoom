import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { EvidencePage } from "./pages/EvidencePage";
import { HomePage } from "./pages/HomePage";
import { IncidentsPage } from "./pages/IncidentsPage";
import { RoomPage } from "./pages/RoomPage";

export function App() {
  const location = useLocation();
  const reduce = useReducedMotion();

  return (
    <AppShell>
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
        >
          <Routes location={location}>
            <Route path="/" element={<HomePage />} />
            <Route path="/room" element={<RoomPage />} />
            <Route path="/incidents" element={<IncidentsPage />} />
            <Route path="/evidence" element={<EvidencePage />} />
            <Route path="*" element={<HomePage />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}
