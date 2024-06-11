#!/bin/sh

# Vérifiez que les variables d'environnement nécessaires sont définies
if [ -z "$GF_DASH_URL" ] || [ -z "$GF_USER" ] || [ -z "$GF_PASSWORD" ] || [ -z "$OUTPUT_PDF" ]; then
  echo "Les variables d'environnement GF_DASH_URL, GF_USER, GF_PASSWORD, et OUTPUT_PDF doivent être définies."
  exit 1
fi

# Exécuter le script Node.js avec les arguments nécessaires
node grafana_pdf.js "$GF_DASH_URL" "$GF_USER:$GF_PASSWORD" "$OUTPUT_PDF"

