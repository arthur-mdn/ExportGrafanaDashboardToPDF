# Grafana PDF Exporter

Ce projet permet d'exporter des tableaux de bord Grafana en PDF en utilisant Puppeteer. Le projet utilise un serveur Node.js pour gérer les requêtes HTTP et lancer Puppeteer pour générer les PDFs.

## Prérequis

- Docker
- Docker Compose

## Installation

Clonez ce dépôt et accédez au répertoire du projet :

```bash
git clone https://github.com/votre-utilisateur/grafana-pdf-exporter.git
cd grafana-pdf-exporter
```

## Configuration
### Docker
Assurez-vous que Docker et Docker Compose sont installés sur votre machine.

### Variables d'environnement
Dupliquez le fichier `.env.example` et renommez-le en `.env`. Modifiez les valeurs en fonction de votre configuration.

```dotenv
GRAFANA_USER=pdf_export
GRAFANA_PASSWORD=pdf_export
```


### Utilisation
Pour lancer le projet, exécutez la commande suivante :

```bash
docker compose up --build
```
Le serveur sera accessible sur le port 3000.

### Génération d'un PDF
Pour générer un PDF, envoyez une requête POST à l'API /generate-pdf avec l'URL du tableau de bord Grafana en paramètre.
Le serveur répondra avec l'URL du PDF généré.

#### Via cURL
```bash
curl -X POST http://localhost:3000/generate-pdf -H "Content-Type: application/json" -d '{
"url": "http://votre-grafana-server:3000/d/your-dashboard-id?orgId=1"
}'
```
#### Via un bouton HTML injecté dans Grafana
![Injection du bouton dans Grafana](https://github.com/arthur-mdn/grafana-export-to-pdf/blob/main/illustrations/inject-button-inside-grafana.png)

Pour injecter un bouton directement dans Grafana, ajoutez le contenu du fichier `grafana-button.html` dans le champ "Text" d'un panneau de texte Grafana.
Veillez à modifier l'URL du serveur si nécessaire.
```javascript
const pdfGeneration = true;
const pdfGenerationServerUrl = 'http://localhost:3000/';
```
> Vous devez vous assurer que le paramètre ``disable_sanitize_html`` est à ``true`` dans le fichier de configuration Grafana.

