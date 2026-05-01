# Franziskas Rodeo

Ein personalisiertes Inverted-Pendulum Balance Game zum 31. Geburtstag.

## Tech Stack
- Vanilla HTML, CSS, JavaScript
- Canvas API für das Rendern der Assets

## Deployment Info (H-Town)
Das Spiel läuft live auf dem H-Town Server unter:
`https://h-town.duckdns.org/PÄRT`

### Server Config (Nginx)
Der Server hostet die Daten im Verzeichnis `/var/www/html/paert`.
Es gibt zwei Nginx-Routen, um die Umlaut-Problematik aufzufangen (h-town-https.conf):
```nginx
    # Franziskas Rodeo Game
    location /paert/ {
        alias /var/www/html/paert/;
        index index.html;
        try_files $uri $uri/ /paert/index.html;
    }
    
    # URL encoded PÄRT redirect
    location ~ "^/P\xc3\x84RT" { return 301 /paert/; }
```

### Uploading / Deploying Updates
Die Dateien werden via SSH vom lokalen Rechner übertragen. Da Windows PowerShell teilweise UTF-8 in Pipes korrumpiert, gibt es zwei Helper-Skripte:
- `deploy.js`: Lädt alle Assets (Bilder, Sound) per Base64 kodiert hoch.
- `upload.js`: Lädt HTML, CSS und JS per Base64 kodiert hoch.

Einfach lokal `node upload.js` ausführen, um Code-Änderungen live zu pushen.
