import { Route, Routes } from "react-router-dom";
import Doors from "./pages/Doors";
import { Exports, Runs, SessionRevisions, SessionRuns } from "./pages/Ledgers";
import RunCapture from "./pages/RunCapture";
import RunConsole from "./pages/RunConsole";
import SessionAuthor from "./pages/SessionAuthor";
import Shelf from "./pages/Shelf";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Shelf />} />
      <Route path="/sessions/:id" element={<SessionAuthor />} />
      <Route path="/sessions/:id/revisions" element={<SessionRevisions />} />
      <Route path="/sessions/:id/runs" element={<SessionRuns />} />
      <Route path="/runs" element={<Runs />} />
      <Route path="/runs/:id" element={<RunConsole />} />
      <Route path="/runs/:id/capture" element={<RunCapture />} />
      <Route path="/exports" element={<Exports />} />
      <Route path="/doors" element={<Doors />} />
    </Routes>
  );
}
