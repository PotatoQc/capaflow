import { Navigate, Route, Routes } from 'react-router-dom';
import DemoBar from './demo/DemoBar';
import Connexion from './screens/Connexion';
import Gestion from './screens/Gestion';
import Porte from './screens/Porte';
import Tableau from './screens/Tableau';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/connexion" element={<Connexion />} />
        <Route path="/porte" element={<Porte />} />
        <Route path="/tableau" element={<Tableau />} />
        <Route path="/gestion" element={<Gestion />} />
        <Route path="*" element={<Navigate to="/connexion" replace />} />
      </Routes>
      <DemoBar />
    </>
  );
}
