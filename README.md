# Budget à deux

Application de budget pour Antoine et Amandine : import des relevés CSV Scotiabank, historique Excel, budgets Commun et personnels, avances entre vous, événements, vue mensuelle et annuelle.

Version 1.1 — coffre chiffré, application installable, synchronisation Google Drive.

## Ce que fait cette version

- **Données chiffrées sur l'appareil** (AES-256-GCM, dans le stockage du navigateur). Rien n'est envoyé sur Internet.
- **Un mot de passe partagé** (10 caractères minimum) et une **clé de récupération** de 24 caractères, affichée une seule fois à la création. Mot de passe oublié : la clé rouvre les données et permet d'en choisir un nouveau.
- **Verrouillage automatique** après 5 minutes d'inactivité, et bouton « Verrouiller ».
- **Enregistrement automatique** après chaque modification.
- **Sauvegarde** : Paramètres › « Télécharger une sauvegarde chiffrée » produit un fichier `.budget`. Un rappel s'affiche sur le tableau de bord après 7 jours sans sauvegarde.
- **Restauration** d'un fichier `.budget`, avec son mot de passe ou sa clé de récupération (depuis l'écran de création ou Paramètres).
- **Fonctionne hors ligne** une fois ouverte, et s'installe comme une application (Android et PC).

## Mettre l'application en ligne (gratuit, une seule fois)

L'application doit être servie en **https** : le chiffrement du navigateur l'exige. GitHub Pages le fait gratuitement.

1. Créez un compte sur [github.com](https://github.com) si vous n'en avez pas.
2. Cliquez sur **New repository**. Nom : `budget-a-deux`. Visibilité : **Public** (obligatoire pour GitHub Pages gratuit ; seul le code est public, jamais vos données). Cliquez sur **Create repository**.
3. Sur la page du dépôt, cliquez sur **uploading an existing file**, puis glissez **tout le contenu** du dossier `budget-a-deux` (le fichier `index.html` doit être à la racine, avec les dossiers `js` et `icons`). Cliquez sur **Commit changes**.
4. Allez dans **Settings › Pages**. Sous *Branch*, choisissez `main` et `/ (root)`, puis **Save**.
5. Après une à deux minutes, l'adresse s'affiche en haut de cette page, du type `https://votre-nom.github.io/budget-a-deux/`.

## Installer sur vos appareils

- **Android (Chrome)** : ouvrez l'adresse, menu ⋮ › **Installer l'application** (ou « Ajouter à l'écran d'accueil »).
- **PC (Chrome ou Edge)** : ouvrez l'adresse, puis l'icône d'installation à droite de la barre d'adresse.

## Première utilisation

1. Créez le coffre avec votre mot de passe commun. **Notez la clé de récupération** (gestionnaire de mots de passe ou papier, chacun de votre côté).
2. **Importer** : déposez vos CSV Scotiabank (chèque et carte), puis votre fichier Excel de suivi en bas de la page.
3. **Budgets** et **Paramètres** : ajustez au besoin.
4. Faites une première **sauvegarde** et rangez le fichier `.budget` dans votre dossier Google Drive partagé.

## Synchronisation Google Drive

Le coffre chiffré est déposé dans votre dossier Drive partagé sous le nom `budget-a-deux.budget`. Google ne voit qu'un contenu illisible.

- **Premier appareil** : Paramètres › Synchronisation Google Drive › « Premier appareil : créer le fichier dans le dossier partagé ». Connectez-vous à Google, puis choisissez le dossier partagé.
- **Autres appareils** (dont ceux d'Amandine, avec son propre compte Google) : à la création du coffre, touchez « Rejoindre le coffre déjà sur Google Drive », choisissez le fichier, puis saisissez le mot de passe commun. Sur un appareil qui a déjà un coffre : Paramètres › « Autre appareil : ouvrir le fichier existant » (les données des deux côtés sont réunies).
- La synchronisation se fait à l'ouverture, au retour sur l'application, après chaque modification et toutes les 2 minutes. Si les deux appareils ont changé des choses, elles sont réunies transaction par transaction.
- Google demande de se reconnecter environ toutes les heures : le menu affiche alors « Se connecter à Google ».
- Un changement de mot de passe sur un appareil s'applique aux autres à la synchronisation suivante.

Configuration Google Cloud (déjà faite) : projet « Budget a deux », API Drive et Picker activées, ID client OAuth limité à `https://antchaux.github.io`, comptes test Antoine et Amandine, portée `drive.file`.

## Mettre à jour l'application

Remplacez les fichiers dans le dépôt GitHub (même méthode qu'à l'étape 3). Vos données ne sont pas touchées : elles restent sur vos appareils. Changez le numéro `VERSION` dans `sw.js` pour forcer la mise à jour hors ligne.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Page et styles |
| `js/vault.js` | Chiffrement, clés, stockage |
| `js/lock.js` | Écrans de création, déverrouillage, récupération, verrouillage automatique |
| `js/drive.js` | Connexion Google, sélecteur de dossier/fichier, lecture et écriture sur Drive |
| `js/app.js` | Application (imports, budgets, tableaux de bord) |
| `js/sync.js` | Synchronisation et fusion entre appareils |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installation et fonctionnement hors ligne |

Bibliothèque externe : SheetJS 0.18.5 (lecture du fichier Excel), chargée depuis cdnjs au premier import Excel, puis gardée en cache.
