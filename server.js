require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { exec} = require('child_process');

const GRAFANA_USER = process.env.GRAFANA_USER;
const GRAFANA_PASSWORD = process.env.GRAFANA_PASSWORD;

const app = express();
const port = 3000;

app.use(express.json());
app.use(cors());
app.use('/output', express.static(path.join(__dirname, 'output')));

app.post('/generate-pdf', (req, res) => {
  let { url, from, to } = req.body;

  if (!url) {
    return res.status(400).send('URL is required');
  }

  if (from) {
    url += `&from=${from}`;
  }
  if (to) {
    url += `&to=${to}`;
  }

  const script = `node grafana_pdf.js "${url}" "${GRAFANA_USER}:${GRAFANA_PASSWORD}"`;
  console.log(`Executing script: ${script}`);

  exec(script, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      console.error(`stderr: ${stderr}`);
      return res.status(500).send('Error generating PDF');
    }
    if (stderr) {
      console.error(`stderr: ${stderr}`);
      return res.status(500).send('Error generating PDF');
    }
    console.log(`stdout: ${stdout}`);

    const match = stdout.match(/PDF généré : (.+\.pdf)/);
    if (match) {
      const pdfPath = match[1];
      const pdfUrl = `http://localhost:${port}/output/${path.basename(pdfPath)}`;
      res.json({ pdfUrl });
    } else {
      res.status(500).send('Error generating PDF');
    }
  });
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
