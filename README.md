# Balatom

**Balatom** est un jeu navigateur mélangeant les mécaniques de **Sutom** (deviner un mot avec indices rouge/jaune/bleu) et de **Balatro** (scoring, blinds/antes, jokers et boutique).

## Concept

- Progressez à travers des **antes** composées de 3 blinds (Petite, Grosse, Boss) avec un score cible croissant.
- À chaque blind, un mot secret est à deviner façon Sutom : la première lettre est révélée, chaque essai donne un feedback couleur (rouge = bien placé, jaune = présent, bleu = absent).
- Chaque essai rapporte des points (**jetons × multiplicateur**) selon les lettres trouvées. Atteignez le score cible avant d'épuiser vos essais pour remporter le blind.
- Gagnez de l'argent, achetez des **jokers** en boutique pour modifier le scoring, et visez l'ante 8 pour gagner la partie.

## Lancer en local

```bash
docker compose up -d --build
# puis ouvrir http://localhost:8095
```

Ou simplement ouvrir `index.html` dans un navigateur (les mots sont chargés depuis `words.json`, un petit serveur local peut être nécessaire selon le navigateur).

## Stack

- HTML / CSS / JavaScript vanilla
- Nginx dans un conteneur Docker
- Déploiement via Docker Compose

## Déploiement

```bash
git pull
docker compose up -d --build
```

## Licence

Projet personnel.
