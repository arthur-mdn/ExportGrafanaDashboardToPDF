# Grafana PDF Exporter

Ce projet permet d'exporter des tableaux de bord Grafana en PDF en utilisant Puppeteer. Le projet utilise un serveur Node.js pour gérer les requêtes HTTP et lancer Puppeteer pour générer les PDFs.

Il est possible d'injecter un bouton dans Grafana pour générer un PDF directement depuis l'interface.

![Affichage du bouton dans Grafana](https://github.com/arthur-mdn/grafana-export-to-pdf/blob/main/illustrations/injected-button-in-grafana.png)

## Prérequis

- Docker
- Docker Compose

## Installation

Clonez ce dépôt et accédez au répertoire du projet :

```bash
git clone https://github.com/arthur-mdn/grafana-export-to-pdf/
cd grafana-export-to-pdf
```

## Configuration

### Variables d'environnement
Dupliquez le fichier `.env.example` et renommez-le en `.env`. 

```bash
cp .env.template .env
nano .env
```

Modifiez les valeurs en fonction de votre configuration.

```dotenv
GRAFANA_USER=pdf_export
GRAFANA_PASSWORD=pdf_export
```


## Utilisation
Pour lancer le projet, exécutez la commande suivante :

```bash
docker compose up -d --build
```
Le serveur sera accessible sur le port 3000.

### Génération d'un PDF
Pour générer un PDF, envoyez une requête POST à l'API /generate-pdf avec l'URL du tableau de bord Grafana en paramètre.
Le serveur répondra avec l'URL du PDF généré.

#### Via cURL
```bash
curl -X POST http://localhost:3000/generate-pdf -H "Content-Type: application/json" -d '{
"url": "http://votre-serveur-grafana/d/your-dashboard-id?orgId=1&kiosk"
}'
```
#### Via un bouton HTML injecté dans Grafana
> Vous devez vous assurer que le paramètre ``disable_sanitize_html`` est à ``true`` dans le fichier de configuration Grafana pour pouvoir injecter du code HTML et Javascript.
> 
![Comment injecter le bouton dans Grafana](https://github.com/arthur-mdn/grafana-export-to-pdf/blob/main/illustrations/inject-button-in-grafana.png)

Pour injecter un bouton directement dans Grafana, ajoutez le contenu du fichier `grafana-button.html` dans le champ "Text" d'un panneau de texte Grafana.
Veillez à modifier l'URL du serveur si nécessaire.
```javascript
const pdfGeneration = true;
const pdfGenerationServerUrl = 'http://localhost:3000/';
```

