# Balatom

**Balatom** est un jeu navigateur mélangeant les mécaniques de **Sutom** (deviner un mot avec indices rouge/jaune/bleu) et de **Balatro** (scoring, blinds/antes, jokers et boutique).

## Concept

- Progressez à travers des **antes** composées de 3 blinds (Petite, Grosse, Boss) avec un score cible croissant.
- À chaque blind, un mot secret est à deviner façon Sutom : la première lettre est révélée, chaque essai donne un feedback couleur (rouge = bien placé, jaune = présent, bleu = absent).
- Chaque essai rapporte des points (**jetons × multiplicateur**) selon les lettres trouvées. Atteignez le score cible avant d'épuiser vos essais pour remporter le blind.
- Gagnez de l'argent, achetez des **jokers** en boutique pour modifier le scoring, et visez l'ante 8 pour gagner la partie.

## Authentification Google

L'application inclut une authentification Google (OAuth) côté serveur. Si les variables ne sont pas configurées, le jeu reste accessible sans connexion.

Configurer un fichier `.env` (voir `.env.example`) :

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SESSION_SECRET=... # openssl rand -hex 32
```

Dans la console Google Cloud, déclarer :
- Origine JavaScript autorisée : `https://balatom.laurans.org`
- URI de redirection : `https://balatom.laurans.org/auth/google/callback`

`APP_BASE_URL` est défini dans `docker-compose.yml` (`https://balatom.laurans.org`).

## Lancer en local

```bash
docker compose up -d --build
# puis ouvrir http://localhost:8095
```

Sans `.env`, le serveur démarre mais l'authentification Google est désactivée.

## Stack

- HTML / CSS / JavaScript vanilla (frontend, `public/`)
- Node.js (serveur sans dépendance, `src/server.js`) : fichiers statiques + OAuth Google + session cookie
- Docker / Docker Compose

## Déploiement

```bash
git pull
docker compose up -d --build
```

Sur `ociuc` : `/app/balatom` (conteneur `balatom`, port `8095:3000`).

## Licence

Projet personnel.
