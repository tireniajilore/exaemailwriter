import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import TestHarness from "./pages/TestHarness";
import NotFound from "./pages/NotFound";
import { ProlificProvider } from "./contexts/ProlificContext";
import ProlificWelcome from "./pages/prolific/ProlificWelcome";
import ProlificSetup from "./pages/prolific/ProlificSetup";
import ProlificApp from "./pages/prolific/ProlificApp";
import ProlificRead from "./pages/prolific/ProlificRead";
import ProlificSurvey from "./pages/prolific/ProlificSurvey";
import ProlificComplete from "./pages/prolific/ProlificComplete";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/tests" element={<TestHarness />} />
          
          {/* Prolific Study Routes - wrapped in single provider */}
          <Route
            path="/prolific/*"
            element={
              <ProlificProvider>
                <Routes>
                  <Route index element={<ProlificWelcome />} />
                  <Route path="setup" element={<ProlificSetup />} />
                  <Route path="app" element={<ProlificApp />} />
                  <Route path="read" element={<ProlificRead />} />
                  <Route path="survey" element={<ProlificSurvey />} />
                  <Route path="complete" element={<ProlificComplete />} />
                </Routes>
              </ProlificProvider>
            }
          />
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
