# SouthEvents Porte (ex-CapaFlow) — règles du projet

@PLAN.md

## Le plan fait loi

- `PLAN.md` est la **seule source de vérité**. Le suivre à la lettre : stack, structure, noms, champs, formules, constantes, écrans, rôles, règles, phases.
- Ne rien ajouter qui n'est pas dans le plan : fonctionnalité, dépendance, service, écran, paramètre.
- Si le plan est ambigu, incomplet, contradictoire ou impossible à respecter : **s'arrêter**, expliquer le blocage et poser la question à l'utilisateur (menu de choix avec une option de réponse libre). Ne jamais trancher seul.
- `PLAN.md` ne se modifie qu'avec l'accord explicite de l'utilisateur, et chaque changement ajoute une ligne datée au §14.

## Façon de travailler

1. Suivre les phases du §13 dans l'ordre. Ne pas commencer une phase tant que la précédente n'est pas acceptée.
2. Au début d'une phase : relire les sections concernées et annoncer en une ligne ce qui sera livré.
3. À la fin d'une phase : exécuter chaque critère d'acceptation et montrer la preuve (sortie de test, commande, capture). Un seul critère en échec = phase non terminée.
4. Citer les sections du plan dans les messages de commit (ex. `§9.3`).

## Interdits

- Plan Blaze, Cloud Functions ou tout autre service payant.
- Un secret dans le dépôt, qui est public : les IDs des listes de check-in vont uniquement dans les secrets Wrangler.
- Des tests contre la base de production le vendredi 25 sept. (quota partagé avec la soirée).
- Un déploiement le vendredi 25 sept., sauf correctif bloquant approuvé par l'utilisateur.
