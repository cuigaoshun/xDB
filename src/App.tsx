import { MainLayout } from "./components/layout/MainLayout";
import { Toaster } from "./components/ui/toaster";
import { useUpdater } from "./hooks/useUpdater";
import "./i18n";

function App() {
  useUpdater();

  return (
    <>
      <MainLayout />
      <Toaster />
    </>
  );
}

export default App;
