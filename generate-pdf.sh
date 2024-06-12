#!/bin/sh

# Charger les variables d'environnement du fichier .env
set -a
[ -f /usr/src/app/.env ] && . /usr/src/app/.env
set +a

# Vérifiez les arguments en ligne de commande
while [ "$1" != "" ]; do
    case $1 in
        GF_DASH_URL )           shift
                                GF_DASH_URL=$1
                                ;;
        GF_USER )               shift
                                GF_USER=$1
                                ;;
        GF_PASSWORD )           shift
                                GF_PASSWORD=$1
                                ;;
        * )                     echo "Option $1 not recognized"
                                exit 1
    esac
    shift
done

# Vérifiez que GF_DASH_URL est défini
if [ -z "$GF_DASH_URL" ]; then
  echo "La variable d'environnement GF_DASH_URL doit être définie."
  exit 1
fi

# Utiliser les valeurs par défaut du .env si les arguments ne sont pas fournis
GF_USER=${GF_USER:-$DEFAULT_GF_USER}
GF_PASSWORD=${GF_PASSWORD:-$DEFAULT_GF_PASSWORD}

# Envoyer la requête HTTP POST au serveur Node.js pour générer le PDF
RESPONSE=$(curl -s -X POST http://localhost:3000/generate-pdf -H "Content-Type: application/json" -d "{\"url\": \"${GF_DASH_URL}\"}")

# Vérifiez la réponse du serveur Node.js
PDF_URL=$(echo $RESPONSE | jq -r '.pdfUrl')
if [ "$PDF_URL" != "null" ]; then
  echo "PDF généré : $PDF_URL"
else
  echo "Erreur lors de la génération du PDF"
  echo "Réponse du serveur : $RESPONSE"
fi