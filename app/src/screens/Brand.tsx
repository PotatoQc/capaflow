import logo from '../assets/southevents-logo.png';
import mark from '../assets/southevents-mark.png';

// Marque SouthEvents Porte (PLAN §6) : logo complet sur les écrans d'accueil, monogramme dans l'en-tête.
export function Brand({ large = false }: { large?: boolean }) {
  return large ? (
    <div className="brand-lg">
      <img src={logo} alt="SouthEvents" />
      <span>Porte</span>
    </div>
  ) : (
    <div className="brand">
      <img src={mark} alt="SouthEvents" />
      <span>Porte</span>
    </div>
  );
}
