#!/bin/sh

# Charger les variables d'environnement du fichier .env
set -a
[ -f /usr/src/app/.env ] && . /usr/src/app/.env
set +a

# Variables par défaut pour from et to
GF_FROM=""
GF_TO=""

# Vérifiez les arguments
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
        GF_FROM )               shift
                                GF_FROM=$1
                                ;;
        GF_TO )                 shift
                                GF_TO=$1
                                ;;
        * )                     echo "Option $1 not recognized"
                                exit 1
    esac
    shift
done

# Vérifiez que GF_DASH_URL est défini
if [ -z "$GF_DASH_URL" ]; then
  echo "La variable GF_DASH_URL doit être définie."
  exit 1
fi

# Utiliser les valeurs par défaut du .env si les arguments ne sont pas fournis
GF_USER=${GF_USER:-$DEFAULT_GF_USER}
GF_PASSWORD=${GF_PASSWORD:-$DEFAULT_GF_PASSWORD}

# Ajouter les paramètres from et to à la requête POST si fournis
JSON_PAYLOAD="{\"url\": \"${GF_DASH_URL}\""
if [ -n "$GF_FROM" ]; then
  JSON_PAYLOAD="${JSON_PAYLOAD}, \"from\": \"${GF_FROM}\""
fi
if [ -n "$GF_TO" ]; then
  JSON_PAYLOAD="${JSON_PAYLOAD}, \"to\": \"${GF_TO}\""
fi
JSON_PAYLOAD="${JSON_PAYLOAD}}"

# Envoyer la requête HTTP POST au serveur Node.js pour générer le PDF
RESPONSE=$(curl -s -X POST http://localhost:3000/generate-pdf -H "Content-Type: application/json" -d "$JSON_PAYLOAD")

# Vérifiez si la réponse est un JSON valide
if echo "$RESPONSE" | jq . >/dev/null 2>&1; then
  PDF_URL=$(echo $RESPONSE | jq -r '.pdfUrl')
  if [ "$PDF_URL" != "null" ]; then
    echo "PDF généré : $PDF_URL"
  else
    echo "Erreur lors de la génération du PDF"
    echo "Réponse du serveur : $RESPONSE"
  fi
else
  echo "Erreur: La réponse du serveur n'est pas un JSON valide. Réponse brute : $RESPONSE"
fi
