# GreatFlowers AI Marketing API - Deployment Documentation

## 🌐 Production Environment

**Domain:** https://marketing-api.greatflowers.net  
**Server:** 52.38.223.191 (Ubuntu)  
**Port:** 3005 (internal)  
**Process Manager:** PM2  
**Web Server:** Nginx with SSL (Let's Encrypt)  

---

## 📁 Project Location

```
/var/www/Greatflowers-ai-marketing/
```

---

## 🚀 Deployment Setup

### 1. Application Configuration

**Environment Variables** (`.env`):
- `PORT=3005` - Application port
- `CORS_ORIGIN=https://greatflowers.net` - Allowed CORS origin
- `GA4_PROPERTY_ID` - Google Analytics 4 property ID
- `META_PAGE_ACCESS_TOKEN` - Meta (Facebook) page access token
- `META_PAGE_ID` - Facebook page ID
- `META_INSTAGRAM_ACCOUNT_ID` - Instagram account ID
- `AWS_ACCESS_KEY_ID` - AWS S3 access key
- `AWS_SECRET_ACCESS_KEY` - AWS S3 secret key
- `AWS_S3_BUCKET=greatflowers` - S3 bucket name
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to GA4 service account JSON

### 2. PM2 Configuration

**File:** `ecosystem.config.cjs`

```javascript
module.exports = {
  apps: [{
    name: 'greatflowers-marketing-api',
    script: './node_modules/.bin/tsx',
    args: 'src/server.ts',
    cwd: '/var/www/Greatflowers-ai-marketing',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3005
    }
  }]
};
```

### 3. Nginx Configuration

**File:** `/etc/nginx/sites-available/marketing-api-greatflowers`

- Proxies requests from port 443 (HTTPS) to port 3005 (Node.js app)
- SSL certificate managed by Certbot
- Client max body size: 100M
- Proxy timeout: 60s

### 4. SSL Certificate

**Provider:** Let's Encrypt (via Certbot)  
**Certificate Path:** `/etc/letsencrypt/live/marketing-api.greatflowers.net/`  
**Expiry:** 2026-11-25  
**Auto-renewal:** Enabled via Certbot systemd timer

---

## 🔧 Common Operations

### Start the Application
```bash
cd /var/www/Greatflowers-ai-marketing
pm2 start ecosystem.config.cjs
pm2 save
```

### Stop the Application
```bash
pm2 stop greatflowers-marketing-api
```

### Restart the Application
```bash
pm2 restart greatflowers-marketing-api
```

### View Logs
```bash
# Real-time logs
pm2 logs greatflowers-marketing-api

# Last 100 lines
pm2 logs greatflowers-marketing-api --lines 100

# Log files location
/var/www/Greatflowers-ai-marketing/logs/
├── out.log       # Standard output
├── error.log     # Error output
└── combined.log  # Combined logs
```

### Check Status
```bash
pm2 status
pm2 describe greatflowers-marketing-api
```

### Monitor Resources
```bash
pm2 monit
```

---

## 🔄 Deployment Workflow

### For Code Updates:

1. **Pull latest changes:**
   ```bash
   cd /var/www/Greatflowers-ai-marketing
   git pull origin main
   ```

2. **Install dependencies (if package.json changed):**
   ```bash
   npm install
   ```

3. **Restart the application:**
   ```bash
   pm2 restart greatflowers-marketing-api
   ```

4. **Verify deployment:**
   ```bash
   pm2 logs greatflowers-marketing-api --lines 50
   curl https://marketing-api.greatflowers.net/api/meta/status
   ```

---

## 🧪 Testing Endpoints

### Health Check
```bash
curl https://marketing-api.greatflowers.net/api/meta/status
```

### Local Testing
```bash
curl http://localhost:3005/api/meta/status
```

---

## 📊 Key API Endpoints

- `GET /api/meta/status` - Check Meta (Facebook/Instagram) connection status
- `GET /api/analytics/summary` - Get GA4 analytics summary
- `POST /api/campaigns` - Create a new marketing campaign
- `GET /api/campaigns` - List all campaigns
- `POST /api/recommendations/generate` - Generate AI campaign recommendations
- `POST /api/meta/publish/facebook` - Publish campaign to Facebook
- `POST /api/meta/publish/instagram` - Publish campaign to Instagram

---

## 🔐 Security Notes

- SSL certificate auto-renews via Certbot
- CORS restricted to `https://greatflowers.net`
- Sensitive credentials stored in `.env` (not in git)
- Service account JSON file for GA4 stored securely on server

---

## 🐛 Troubleshooting

### Application won't start
```bash
# Check PM2 logs
pm2 logs greatflowers-marketing-api --err

# Check if port 3005 is available
lsof -ti:3005

# Verify environment variables
pm2 env 7  # Replace 7 with actual PM2 ID
```

### SSL certificate issues
```bash
# Test certificate
sudo certbot certificates

# Renew certificate manually
sudo certbot renew --dry-run
```

### Nginx issues
```bash
# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log
```

### Permission issues
```bash
# Fix ownership
sudo chown -R ubuntu:ubuntu /var/www/Greatflowers-ai-marketing
```

---

## 📦 Dependencies

- **Node.js:** v24.14.1
- **Package Manager:** npm
- **TypeScript Runtime:** tsx (for running TypeScript directly)
- **Key Packages:**
  - express - Web framework
  - @google-analytics/data - GA4 integration
  - @aws-sdk/client-s3 - AWS S3 for image storage
  - sharp - Image processing
  - cors - CORS middleware
  - zod - Schema validation

---

## 🔗 Related Services

- **Main Website:** https://greatflowers.net
- **Admin Panel:** https://admin.greatflowers.net
- **API Backend:** https://api.greatflowers.net
- **Frontend (Sandbox):** https://greatflowers.needsmet.work

---

## 📝 Notes

- This is a TypeScript/Node.js application running with `tsx` (no build step required)
- PM2 runs the application in cluster mode for better performance
- Application automatically restarts on crashes
- Memory limit set to 500MB to prevent memory leaks
- Logs are rotated automatically by PM2

---

## 🆘 Support

For issues or questions:
1. Check PM2 logs: `pm2 logs greatflowers-marketing-api`
2. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Verify DNS: `nslookup marketing-api.greatflowers.net`
4. Test local connectivity: `curl http://localhost:3005/api/meta/status`

---

**Last Updated:** August 27, 2026
