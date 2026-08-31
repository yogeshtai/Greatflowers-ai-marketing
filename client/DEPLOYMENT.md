# GreatFlowers AI Marketing Admin - Frontend Deployment

## 🌐 Production Environment

**Domain:** https://marketing-admin.greatflowers.net  
**Server:** 52.38.223.191 (Ubuntu)  
**Port:** 3006 (internal)  
**Process Manager:** PM2  
**Web Server:** Nginx with SSL (Let's Encrypt)  
**Framework:** React + Vite + TypeScript  

---

## 📁 Project Location

```
/var/www/Greatflowers-ai-marketing/client/
```

---

## 🔗 Connected Services

**Backend API:** https://marketing-api.greatflowers.net  
**Environment Variable:** `VITE_API_URL=https://marketing-api.greatflowers.net`

---

## 🚀 Deployment Setup

### 1. Environment Configuration

**File:** `.env`

```bash
VITE_API_URL=https://marketing-api.greatflowers.net
```

### 2. Vite Configuration

**File:** `vite.config.ts`

- Preview server runs on port 3006
- Allowed hosts: `marketing-admin.greatflowers.net`, `localhost`
- Build output: `dist/`
- Minification: esbuild

### 3. PM2 Configuration

**File:** `ecosystem.config.cjs`

```javascript
module.exports = {
  apps: [{
    name: 'greatflowers-marketing-admin',
    script: 'npx',
    args: 'vite preview --port 3006 --host',
    cwd: '/var/www/Greatflowers-ai-marketing/client',
    instances: 1,
    autorestart: true,
    max_memory_restart: '300M',
    env: { NODE_ENV: 'production', PORT: 3006 }
  }]
};
```

### 4. Nginx Configuration

**File:** `/etc/nginx/sites-available/marketing-admin-greatflowers`

- Proxies requests from port 443 (HTTPS) to port 3006 (Vite preview)
- SSL certificate managed by Certbot
- Client max body size: 100M
- Proxy timeout: 60s

### 5. SSL Certificate

**Provider:** Let's Encrypt (via Certbot)  
**Certificate Path:** `/etc/letsencrypt/live/marketing-admin.greatflowers.net/`  
**Expiry:** 2026-11-25  
**Auto-renewal:** Enabled via Certbot systemd timer

---

## 🔧 Common Operations

### Build the Application
```bash
cd /var/www/Greatflowers-ai-marketing/client
npm run build
```

### Start the Application
```bash
cd /var/www/Greatflowers-ai-marketing/client
pm2 start ecosystem.config.cjs
pm2 save
```

### Stop the Application
```bash
pm2 stop greatflowers-marketing-admin
```

### Restart the Application
```bash
pm2 restart greatflowers-marketing-admin
```

### View Logs
```bash
# Real-time logs
pm2 logs greatflowers-marketing-admin

# Last 100 lines
pm2 logs greatflowers-marketing-admin --lines 100

# Log files location
/var/www/Greatflowers-ai-marketing/client/logs/
├── out.log       # Standard output
├── error.log     # Error output
└── combined.log  # Combined logs
```

### Check Status
```bash
pm2 status
pm2 describe greatflowers-marketing-admin
```

---

## 🔄 Deployment Workflow

### For Code Updates:

1. **Pull latest changes:**
   ```bash
   cd /var/www/Greatflowers-ai-marketing/client
   git pull origin main
   ```

2. **Install dependencies (if package.json changed):**
   ```bash
   npm install
   ```

3. **Rebuild the application:**
   ```bash
   npm run build
   ```

4. **Restart the application:**
   ```bash
   pm2 restart greatflowers-marketing-admin
   ```

5. **Verify deployment:**
   ```bash
   pm2 logs greatflowers-marketing-admin --lines 50
   curl https://marketing-admin.greatflowers.net
   ```

---

## 🧪 Testing

### Health Check
```bash
curl https://marketing-admin.greatflowers.net
```

### Local Testing
```bash
curl http://localhost:3006
```

### Test API Connection
Open browser console at https://marketing-admin.greatflowers.net and check network requests to verify API calls are going to `https://marketing-api.greatflowers.net`

---

## 🎨 Features

### Campaign Management
- Create AI-powered marketing campaigns
- Generate campaign recommendations based on GA4 analytics
- View campaign history
- Approve/reject campaigns

### Meta Integration
- Publish campaigns to Facebook
- Publish campaigns to Instagram
- View Meta connection status

### Analytics Integration
- View Google Analytics 4 data
- Product performance metrics
- Customer behavior insights

### AI Recommendations
- Hermes AI-powered campaign suggestions
- Product catalog integration
- Occasion-based recommendations

---

## 🔐 Security

- SSL certificate auto-renews via Certbot
- API calls restricted to HTTPS
- Environment variables for sensitive data
- CORS configured on backend

---

## 🐛 Troubleshooting

### Application won't start
```bash
# Check PM2 logs
pm2 logs greatflowers-marketing-admin --err

# Check if port 3006 is available
lsof -ti:3006

# Verify build exists
ls -la /var/www/Greatflowers-ai-marketing/client/dist/
```

### "Blocked request" error
This happens when Vite preview doesn't recognize the host. Make sure `vite.config.ts` has the correct `allowedHosts` configuration.

### API connection issues
```bash
# Check backend is running
curl https://marketing-api.greatflowers.net/api/meta/status

# Check CORS settings on backend
cat /var/www/Greatflowers-ai-marketing/.env | grep CORS_ORIGIN

# Verify environment variable
cat /var/www/Greatflowers-ai-marketing/client/.env
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

---

## 📦 Dependencies

- **Node.js:** v24.14.1
- **Package Manager:** npm
- **Build Tool:** Vite 8.2.0
- **Framework:** React 19.2.8
- **Key Packages:**
  - axios - HTTP client for API calls
  - react-dom - React rendering
  - typescript - Type safety
  - @vitejs/plugin-react - Vite React plugin

---

## 🔗 Related Services

- **Backend API:** https://marketing-api.greatflowers.net
- **Main Website:** https://greatflowers.net
- **Admin Panel:** https://admin.greatflowers.net
- **API Backend:** https://api.greatflowers.net

---

## 📝 Notes

- This is a React SPA built with Vite
- Uses Vite preview mode for production (no separate web server needed)
- PM2 manages the Vite preview process
- Application automatically restarts on crashes
- Memory limit set to 300MB
- Build artifacts stored in `dist/` directory

---

## 🆘 Support

For issues or questions:
1. Check PM2 logs: `pm2 logs greatflowers-marketing-admin`
2. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Verify DNS: `nslookup marketing-admin.greatflowers.net`
4. Test local connectivity: `curl http://localhost:3006`
5. Check backend API: `curl https://marketing-api.greatflowers.net/api/meta/status`

---

**Last Updated:** August 27, 2026
