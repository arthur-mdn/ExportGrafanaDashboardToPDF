const express = require('express');
const cors = require('cors');
const path = require('path');
const { fork } = require('child_process');
const logger = require('./logger');

const GRAFANA_USER = process.env.GRAFANA_USER;
const GRAFANA_PASSWORD = process.env.GRAFANA_PASSWORD;
const GRAFANA_SERVICE_ACCOUNT = process.env.GRAFANA_SERVICE_ACCOUNT === 'true';

const app = express();
const port = 3001;

if (!GRAFANA_USER || !GRAFANA_PASSWORD) {
    logger.error('Environment variables GRAFANA_USER and GRAFANA_PASSWORD must be set. Please configure runtime environment properly.');
    process.exit(1);
}

app.use(express.json());
app.use(cors());
app.use('/output', express.static(path.join(__dirname, 'output')));

app.get('/check-status', (req, res) => {
  res.send('Server is running');
  logger.info('Status check endpoint called');
});

app.post('/generate-pdf', (req, res) => {
  logger.info('PDF generation request received');

  let { url: requestUrl, from, to, pdfWidthPx, pdfHeightPx } = req.body;

  if (!requestUrl) {
    logger.warn('Generate PDF called without URL parameter');
    return res.status(400).send('URL is required');
  }

  try {
    const urlObj = new URL(requestUrl);

    if (from && !urlObj.searchParams.has('from')) {
      urlObj.searchParams.append('from', from);
    }
    if (to && !urlObj.searchParams.has('to')) {
      urlObj.searchParams.append('to', to);
    }

    const finalUrl = urlObj.toString();

    const args = [finalUrl, GRAFANA_SERVICE_ACCOUNT ? `${GRAFANA_PASSWORD}` : `${GRAFANA_USER}:${GRAFANA_PASSWORD}`];

    if (pdfWidthPx) args.push(`--pdfWidthPx=${pdfWidthPx}`);
    if (pdfHeightPx) args.push(`--pdfHeightPx=${pdfHeightPx}`);

    const script = fork('grafana_pdf.js', args);

    script.on('message', (message) => {
      if (message.success) {
        const pdfPath = message.path;
        const pdfUrl = `${req.protocol}://${req.get('host')}/output/${path.basename(pdfPath)}`;
        logger.info('PDF generated successfully: %s', pdfUrl);
        res.json({ pdfUrl });
      } else {
        logger.error('Error generating PDF: %s', message.error);
        res.status(500).send(`Error generating PDF: ${message.error}`);
      }
    });

    script.on('error', (error) => {
      logger.error('Child process error generating PDF: %s', error.message);
      res.status(500).send(`Error generating PDF: ${error.message}`);
    });
  
  } catch (error) {
    logger.error('Exception processing generate-pdf request: %s', error.message);
    return res.status(500).send(`Error processing request: ${error.message}`);
  }
});

app.listen(port, () => {
  logger.info(`Server is listening on 0.0.0.0:${port}`);
});
