import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { Dashboard } from './pages/Dashboard';
import { Calculator } from './pages/Calculator';
import { MarketHeatmap } from './pages/MarketHeatmap';
import { PropertySearch } from './pages/PropertySearch';
import { SellerLeadManager } from './pages/SellerLeadManager';
import { BuyerDirectory } from './pages/BuyerDirectory';
import { Deals } from './pages/Deals';
import { DealSheet } from './pages/DealSheet';
import { Insights } from './pages/Insights';
import { DocumentGenerator } from './pages/DocumentGenerator';
import { FollowUps } from './pages/FollowUps';
import { Campaigns } from './pages/Campaigns';
import { Assistant } from './pages/Assistant';
import { AIAnalyzer } from './pages/AIAnalyzer';
import { AdvancedResearch } from './pages/AdvancedResearch';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="calculator" element={<Calculator />} />
        <Route path="markets" element={<MarketHeatmap />} />
        <Route path="properties" element={<PropertySearch />} />
        <Route path="sellers" element={<SellerLeadManager />} />
        <Route path="buyers" element={<BuyerDirectory />} />
        <Route path="deals" element={<Deals />} />
        <Route path="deals/:id/sheet" element={<DealSheet />} />
        <Route path="deals/:id/documents" element={<DocumentGenerator />} />
        <Route path="insights" element={<Insights />} />
        <Route path="follow-ups" element={<FollowUps />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="assistant" element={<Assistant />} />
        <Route path="ai" element={<AIAnalyzer />} />
        <Route path="research" element={<AdvancedResearch />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
