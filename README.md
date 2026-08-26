# GreatFlowers AI Marketing

An AI-powered marketing automation platform for GreatFlowers that combines Google Analytics 4 data analysis with intelligent campaign recommendations and Meta (Facebook/Instagram) ad publishing.

## 🌟 Features

- **GA4 Analytics Integration**: Real-time data fetching from Google Analytics 4
- **AI-Powered Recommendations**: Intelligent campaign suggestions based on analytics data and product catalog
- **Campaign Management**: Create, store, and manage marketing campaigns
- **Meta Ad Publishing**: Automated ad creation and publishing to Facebook/Instagram
- **Product Catalog**: Integrated product management system
- **React Frontend**: Modern, responsive user interface

## 🏗️ Architecture

This is a full-stack application with:
- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React + Vite + TypeScript
- **AI Integration**: Hermes AI for campaign recommendations
- **Analytics**: Google Analytics 4 Data API
- **Social Media**: Meta Marketing API

## 📋 Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Google Analytics 4 account with API access
- Meta Developer account with Marketing API access
- Service account credentials for GA4

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd greatflowers-ai-marketing
```

### 2. Install dependencies

**Backend:**
```bash
npm install
```

**Frontend:**
```bash
cd client
npm install
cd ..
```

### 3. Environment Setup

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Fill in your credentials:
- `GA4_PROPERTY_ID`: Your Google Analytics 4 property ID
- `META_ACCESS_TOKEN`: Your Meta (Facebook) access token
- `META_AD_ACCOUNT_ID`: Your Meta ad account ID
- `HERMES_API_KEY`: Your Hermes AI API key
- `PORT`: Backend server port (default: 3000)

### 4. Google Analytics Setup

Place your GA4 service account JSON file in the root directory as `ga4-service-account.json`.

**To create a service account:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new service account
3. Download the JSON key file
4. Add the service account email to your GA4 property with Viewer permissions

### 5. Run the application

**Development mode:**

Terminal 1 (Backend):
```bash
npm run dev
```

Terminal 2 (Frontend):
```bash
cd client
npm run dev
```

The backend will run on `http://localhost:3000` and the frontend on `http://localhost:5173`.

## 📁 Project Structure

```
greatflowers-ai-marketing/
├── src/                          # Backend source code
│   ├── server.ts                 # Express server setup
│   ├── campaign.recommender.ts   # AI campaign recommendation engine
│   ├── campaign.store.ts         # Campaign data management
│   ├── ga4.analytics.ts          # Google Analytics 4 integration
│   ├── meta.publisher.ts         # Meta ad publishing
│   ├── meta.service.ts           # Meta API service
│   ├── hermes.ts                 # Hermes AI integration
│   ├── greatflowers.products.ts  # Product catalog
│   └── ...
├── client/                       # Frontend React application
│   ├── src/
│   ├── public/
│   └── package.json
├── data/                         # Data storage (gitignored)
├── package.json                  # Backend dependencies
├── tsconfig.json                 # TypeScript configuration
└── .env                          # Environment variables (gitignored)
```

## 🔌 API Endpoints

### Analytics
- `GET /api/analytics/summary` - Get GA4 analytics summary
- `GET /api/analytics/metrics` - Get detailed metrics

### Campaigns
- `GET /api/campaigns` - List all campaigns
- `POST /api/campaigns` - Create a new campaign
- `GET /api/campaigns/:id` - Get campaign details
- `PUT /api/campaigns/:id` - Update campaign
- `DELETE /api/campaigns/:id` - Delete campaign

### Recommendations
- `POST /api/recommendations/generate` - Generate AI campaign recommendations
- `GET /api/recommendations` - Get stored recommendations

### Meta Publishing
- `POST /api/meta/publish` - Publish campaign to Meta platforms

## 🛠️ Technologies Used

### Backend
- **Express**: Web framework
- **TypeScript**: Type-safe JavaScript
- **@google-analytics/data**: GA4 Data API client
- **Zod**: Schema validation
- **CORS**: Cross-origin resource sharing
- **dotenv**: Environment variable management

### Frontend
- **React**: UI library
- **Vite**: Build tool and dev server
- **TypeScript**: Type-safe JavaScript
- **Axios**: HTTP client

## 🔒 Security Notes

- Never commit `.env` files or `ga4-service-account.json` to version control
- Keep your API keys and tokens secure
- Use environment variables for all sensitive data
- Regularly rotate your API keys and access tokens

## 📝 Development

### Backend Development
```bash
npm run dev
```
Uses `tsx watch` for hot-reloading during development.

### Frontend Development
```bash
cd client
npm run dev
```

### Build for Production

**Backend:**
```bash
npm run build
```

**Frontend:**
```bash
cd client
npm run build
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

ISC

## 👥 Authors

GreatFlowers Team

## 🐛 Known Issues

- Ensure GA4 service account has proper permissions
- Meta API tokens need to be refreshed periodically
- Check CORS settings if frontend can't connect to backend

## 📞 Support

For issues and questions, please open an issue in the GitHub repository.
