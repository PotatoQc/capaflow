import { Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './data/AppContext';
import Gestion from './screens/Gestion';
import Journal from './screens/Journal';
import Porte from './screens/Porte';
import Tableau from './screens/Tableau';
import { readReturn } from './square/square';

export default function App() {
  const { role } = useApp();
  const home = role === 'bouncer' || readReturn(window.location.search) ? '/porte' : '/tableau';
  return (
    <Routes>
      <Route path="/porte" element={<Porte />} />
      <Route path="/tableau" element={<Tableau />} />
      <Route path="/gestion" element={<Gestion />} />
      <Route path="/journal" element={<Journal />} />
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  );
}
