import { Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './data/AppContext';
import Gestion from './screens/Gestion';
import Porte from './screens/Porte';
import Tableau from './screens/Tableau';

export default function App() {
  const { role } = useApp();
  return (
    <Routes>
      <Route path="/porte" element={<Porte />} />
      <Route path="/tableau" element={<Tableau />} />
      <Route path="/gestion" element={<Gestion />} />
      <Route path="*" element={<Navigate to={role === 'bouncer' ? '/porte' : '/tableau'} replace />} />
    </Routes>
  );
}
