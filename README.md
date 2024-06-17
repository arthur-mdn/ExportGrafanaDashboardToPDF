# Grafana PDF Exporter

This project allows exporting Grafana dashboards to PDF using Puppeteer. The project uses a Node.js server to handle HTTP requests and launch Puppeteer to generate the PDFs.

It is possible to inject a button into Grafana to generate a PDF directly from the interface.

![Button displayed in Grafana](https://github.com/arthur-mdn/grafana-export-to-pdf/blob/main/illustrations/injected-button-in-grafana.png)

## Prerequisites

- Docker
- Docker Compose

## Installation

Clone this repository and navigate to the project directory:

```shell
git clone https://github.com/arthur-mdn/grafana-export-to-pdf/
cd grafana-export-to-pdf
```

## Configuration

### Environment Variables
Duplicate the `.env.example` file and rename it to `.env`. 

```shell
cp .env.template .env
nano .env
```

Modify the values according to your configuration.

```dotenv
GRAFANA_USER=pdf_export
GRAFANA_PASSWORD=pdf_export
SERVER_URL=http://localhost:3000
```

`GRAFANA_USER` and `GRAFANA_PASSWORD` are the credentials used to authenticate to the Grafana server.
`SERVER_URL` is the URL of the server.

## Usage
To start the project, run the following command:

```shell
docker compose up -d --build
```
The server will be accessible on port 3000.

### Generating a PDF
To generate a PDF, send a POST request to the /generate-pdf API with the Grafana dashboard URL as a parameter.
The server will respond with the URL of the generated PDF.

#### Using cURL
```bash
curl \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{ "url": "http://your-grafana-server/d/your-dashboard-id?orgId=1&kiosk"}' \
  http://localhost:3000/generate-pdf
```

#### Using the `generate-pdf.sh` shell script
```bash
docker compose exec server /usr/src/app/generate-pdf.sh GF_DASH_URL 'http://your-grafana-server/d/your-dashboard-id?orgId=1&kiosk'
```

#### Using an HTML button injected into Grafana
> You must ensure that the ``disable_sanitize_html`` parameter is set to ``true`` in the Grafana configuration file to be able to inject HTML and Javascript code.
>
> ![Disable Sanitize HTML in Grafana Settings](https://github.com/arthur-mdn/grafana-export-to-pdf/blob/main/illustrations/grafana-disable-sanitize-html.png)

To inject a button directly into Grafana, add the content of the `grafana-button.html` file to the "Text" field of a Grafana text panel.

![How to inject the button in Grafana](https://github.com/arthur-mdn/grafana-export-to-pdf/blob/main/illustrations/inject-button-in-grafana.png)

Make sure to modify the server URL if necessary. You can easily deactivate the button injection by setting the `pdfGeneration` variable to `false`.

```javascript
const pdfGeneration = true;
const pdfGenerationServerUrl = 'http://localhost:3000/';
```

The button should now be displayed in the native Grafana share menu.

### Generating a PDF with a time range

> In the examples below, the time range is ``now-1y/y``, which corresponds to last year.

> See more details on supported time ranges in the [Grafana documentation](https://grafana.com/docs/grafana/latest/dashboards/use-dashboards/#time-units-and-relative-ranges).

To generate a PDF with a time range, you can simply add the native Grafana time range parameters to the URL.

```shell
http://your-grafana-server/d/your-dashboard-id?orgId=1&kiosk&from=now-1y%2Fy&to=now-1y%2Fy
```

But you can also specify the time range manually by specifying the `from` and `to` parameters in the request.

#### Using cURL
```bash
curl \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{ "url": "http://your-grafana-server/d/your-dashboard-id?orgId=1&kiosk", "from": "now-1y/y", "to": "now-1y/y"}' \
  http://localhost:3000/generate-pdf
```

#### Using the `generate-pdf.sh` shell script
```bash
docker compose exec server /usr/src/app/generate-pdf.sh GF_DASH_URL 'http://your-grafana-server/d/your-dashboard-id?orgId=1&kiosk' GF_FROM 'now-1y/y' GF_TO 'now-1y/y'
```

#### Using the HTML button injected into Grafana
The injected HTML button already retrieves the values of the selected time range in Grafana. You do not need to specify them manually.

## Custom Configuration

### Fetch the dashboard name and the time range from HTML elements to be used in the PDF filename

To avoid fetching the dashboard name and the time range from the URL (that are sometimes not user-friendly), you can extract the values directly from HTML elements in the Grafana dashboard with a better display format.

#### Example
For this URL: `http://localhost/d/ID/stats?orgId=1&from=now-1y%2Fy&to=now-1y%2Fy`
- The initial PDF filename will be: `stats_now-1y_y_to_now-1y_y.pdf`
- With the custom configuration, the PDF filename could be: `Stats_Sunday_January_1_2023_-_Sunday_December_31_2023.pdf`

#### Activation

To activate this feature, set the following variable to `true` in your `.env` file:
```dotenv
EXTRACT_DATE_AND_DASHBOARD_NAME_FROM_HTML_PANEL_ELEMENTS=true
```

And then add the following code to the Grafana panel where you want to display the dashboard name and the time range. You can customize the display format by modifying the `formatTimestamp` function in the script below:

```html
<div>
    <p id="display_actual_dashboard_title">${__dashboard}</p>
    <p id="display_actual_date" style="text-transform:capitalize;"></p>
</div>
<script>
    (function() {
        function formatTimestamp(timestamp) {
            const date = new Date(timestamp);
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            return date.toLocaleDateString('en-US', options);
        }

        let fromTimestampGrafana = ${__from};
        let toTimestampGrafana = ${__to};

        document.getElementById("display_actual_date").innerHTML = formatTimestamp(fromTimestampGrafana) + " - " + formatTimestamp(toTimestampGrafana);
    })();
</script>
```

### Force Kiosk Mode
By default, `FORCE_KIOSK_MODE` is set to `true`. This means that if the url does not contain the `kiosk` parameter, the server will add it to the URL to ensure that the PDF is generated without any elements overlapping the dashboard content . 

#### Deactivation
You can disable this behavior by setting the following variable to `false` in your `.env` file:
    
```dotenv
FORCE_KIOSK_MODE=false
```

> Disabling this feature would have no effect if the `kiosk` parameter is already present in the URL given to the server.

## Author

- [Arthur Mondon](https://mondon.pro)

### Contributing

- [svet-b](https://gist.github.com/svet-b/1ad0656cd3ce0e1a633e16eb20f66425)
