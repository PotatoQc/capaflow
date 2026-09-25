// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useApp } from '../data/AppContext';
import { savePending } from '../square/square';
import { MemoryProvider } from '../test/MemoryProvider';
import Porte from './Porte';

const STUDENT_LINK = 'https://app.hi.events/check-in/cil_test123#scan';

const REGULAR_LINK = 'https://app.hi.events/check-in/cil_test456#scan';

function LockPrices() {
  const { lockDoorPrices, setCheckinLinks, setCapacity, setSquare } = useApp();
  return (
    <>
      <button onClick={() => setSquare({ enabled: true, appId: 'sq0idp-AbCdEfGhIjKlMn' })}>square-test</button>
      <button onClick={() => lockDoorPrices(10, 30)}>figer-test</button>
      <button onClick={() => setCheckinLinks({ student: STUDENT_LINK, regular: '' })}>liens-test</button>
      <button onClick={() => setCheckinLinks({ student: STUDENT_LINK, regular: REGULAR_LINK })}>liens2-test</button>
      <button onClick={() => setCapacity(150)}>salle-pleine-test</button>
    </>
  );
}

const renderPorte = () =>
  render(
    <MemoryRouter>
      <MemoryProvider>
        <Porte />
        <LockPrices />
      </MemoryProvider>
    </MemoryRouter>,
  );

afterEach(cleanup);

describe('Écran Porte (scénario 23:00, 195 personnes, prix automatiques 8 $ / 23 $)', () => {
  it('vente mixte (2 étudiants + 1 autre) puis annulation du groupe entier', () => {
    renderPorte();
    fireEvent.click(screen.getByRole('button', { name: /VENTE/ }));
    const addStudent = screen.getByRole('button', { name: 'Ajouter un billet Étudiant' });
    fireEvent.click(addStudent);
    fireEvent.click(addStudent);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un billet Autre' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer 3 billets · 39 $' }));
    expect(screen.getByText('198')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Annuler dernier/ }));
    expect(screen.getByText('195')).toBeTruthy();
  });

  it('quantité plafonnée aux places vendables (V = 8)', () => {
    renderPorte();
    fireEvent.click(screen.getByRole('button', { name: /VENTE/ }));
    const add = screen.getByRole('button', { name: 'Ajouter un billet Étudiant' }) as HTMLButtonElement;
    for (let i = 0; i < 12; i++) fireEvent.click(add);
    expect(screen.getByLabelText('Billets Étudiant').textContent).toBe('8');
    expect(add.disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Confirmer 8 billets · 64 $' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('Square activé : « Payer avec Square » + « Payé sans Square »', () => {
    renderPorte();
    fireEvent.click(screen.getByText('square-test'));
    fireEvent.click(screen.getByRole('button', { name: /VENTE/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un billet Autre' }));
    expect(screen.getByRole('button', { name: 'Payer avec Square · 23 $' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Payé sans Square (enregistrer)' }));
    expect(screen.getByText('196')).toBeTruthy();
  });

  it('retour de Square réussi : la vente en attente est enregistrée une seule fois', () => {
    savePending({ student: 1, other: 1, priceStudent: 8, priceOther: 23 });
    window.history.replaceState(null, '', '/?com.squareup.pos.SERVER_TRANSACTION_ID=t1');
    renderPorte();
    expect(screen.getByText('197')).toBeTruthy();
    expect(screen.getByText(/Paiement Square réussi · 31 \$/)).toBeTruthy();
    expect(window.location.search).toBe('');
  });

  it('retour de Square annulé : aucune vente', () => {
    savePending({ student: 0, other: 1, priceStudent: 8, priceOther: 23 });
    window.history.replaceState(null, '', '/?com.squareup.pos.ERROR_CODE=com.squareup.pos.ERROR_TRANSACTION_CANCELED');
    renderPorte();
    expect(screen.getByText('195')).toBeTruthy();
    expect(screen.getByText(/aucune vente enregistrée/)).toBeTruthy();
  });

  it('le bouton Vente affiche les billets encore disponibles (V = 8)', () => {
    renderPorte();
    expect(screen.getByText('8 billets disponibles')).toBeTruthy();
  });

  it('sortie puis réentrée', () => {
    renderPorte();
    fireEvent.click(screen.getByRole('button', { name: /SORTIE/ }));
    expect(screen.getByText('194')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /RÉENTRÉE/ }));
    expect(screen.getByText('195')).toBeTruthy();
  });

  it('staff : + puis − ramène le compteur et l’occupation', () => {
    renderPorte();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un staff' }));
    expect(screen.getByText('196')).toBeTruthy();
    expect(screen.getByText('21')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retirer un staff' }));
    expect(screen.getByText('195')).toBeTruthy();
    expect(screen.getByText('20')).toBeTruthy();
  });

  it('dates limites d’âge au 25 septembre', () => {
    renderPorte();
    expect(screen.getByText('25/09/2008')).toBeTruthy();
    expect(screen.getByText('25/09/2009')).toBeTruthy();
    expect(screen.queryByText(/ou avant/)).toBeNull();
  });

  it('boutons de check-in toujours visibles, actifs une fois les liens configurés', () => {
    renderPorte();
    expect((screen.getByRole('button', { name: /Check-in étudiant/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('liens2-test'));
    const regular = screen.getByRole('link', { name: /Check-in régulier/ }) as HTMLAnchorElement;
    expect(regular.href).toBe(REGULAR_LINK);
    expect(regular.rel).toBe('noopener noreferrer');
    expect((screen.getByRole('button', { name: /Check-in étudiant/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('check-in étudiant : rappel de la carte avant d’ouvrir Hi.Events', () => {
    renderPorte();
    fireEvent.click(screen.getByText('liens-test'));
    fireEvent.click(screen.getByRole('button', { name: /Check-in étudiant/ }));
    expect(screen.getByText('Demandez la carte étudiante AVANT de scanner le billet.')).toBeTruthy();
    const open = screen.getByRole('link', { name: /Carte vérifiée/ }) as HTMLAnchorElement;
    expect(open.href).toBe(STUDENT_LINK);
  });

  it('pas de carte et de la place : vendre 1 billet Autre au prix non-étudiant', () => {
    renderPorte();
    fireEvent.click(screen.getByText('liens-test'));
    fireEvent.click(screen.getByRole('button', { name: /Check-in étudiant/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Pas de carte étudiante' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vendre 1 billet Autre · 23 $' }));
    expect(screen.getByLabelText('Billets Autre').textContent).toBe('1');
    expect(screen.getByRole('button', { name: 'Confirmer 1 billet · 23 $' })).toBeTruthy();
  });

  it('pas de carte et plus de place : refuser l’entrée', () => {
    renderPorte();
    fireEvent.click(screen.getByText('liens-test'));
    fireEvent.click(screen.getByText('salle-pleine-test'));
    fireEvent.click(screen.getByRole('button', { name: /Check-in étudiant/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Pas de carte étudiante' }));
    expect(screen.getByText("REFUSER L'ENTRÉE")).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Vendre 1 billet/ })).toBeNull();
  });

  it('bandeau « Nouveau prix » quand les prix changent', () => {
    renderPorte();
    expect(screen.queryByText(/NOUVEAU PRIX/)).toBeNull();
    fireEvent.click(screen.getByText('figer-test'));
    expect(screen.getByText('NOUVEAU PRIX : 10 $ · 30 $')).toBeTruthy();
  });
});
