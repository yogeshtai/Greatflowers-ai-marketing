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
- `GA4_PROPERTY_ID` and `GOOGLE_APPLICATION_CREDENTIALS`: Your Google Analytics 4 property ID and service-account file
- `META_PAGE_ID`, `META_INSTAGRAM_ACCOUNT_ID`, `META_PAGE_ACCESS_TOKEN`: Your Facebook page, its Instagram business account and a Page access token
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET`: S3 storage for campaign images
- `GF_ADMIN_API_URL`, `GF_ADMIN_EMAIL`, `GF_ADMIN_PASSWORD`: The storefront admin API used to publish blogs, wiki entries and articles
- `HERMES_API_KEY`: Your Hermes AI API key
- `PORT`: Backend server port (default: 3000)

`.env.example` lists every setting with its default, including the optional ones and the
settings for additional brands.

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


## Campaign recommendation variety

Recommendations use weighted random selection across gifting stories, home styling,
flower care, product spotlights, seasonal inspiration and conversation starters.
Less-used themes receive more weight. The latest 20 recommendations and latest 20
published campaigns supply creative history; published history covers campaigns
recorded by this app, not posts created directly on social platforms.

The last two themes in each history are on cooldown, as is the latest visual
treatment in each history. Products used in the last three entries of either
history are excluded when alternatives exist. Product cooldowns relax for small
catalogs or active high/critical holidays so seasonal fit remains possible.
Important holidays also increase the weight of gifting and seasonal inspiration.

The AI still receives today's GA4 product data, live website context, eligible
in-stock catalog products with images, and occasion guidance. Content goals and
calls to action vary by theme. Theme/product validation and exact scenario-repeat
checks enforce rotation; avoiding semantically similar stories remains an AI
instruction. Older saved records work without the new creative metadata.

Run `npm test` for rotation and mocked recommendation regressions,
`npx tsc --noEmit` for backend type checks, and `cd client && npm run build`
for the frontend production build. The tests do not contact GA4, Hermes or Meta.


## Projects (multiple brands)

The agent can run marketing for several storefront brands from one server and one dashboard.
Each brand is a *project* defined in `src/projects/` (`greatflowers.ts`, `onepriceflowers.ts`):
brand names and voice, storefront URLs and paths, catalog API, logo and colours, Hermes skills,
bylines, cron times and data folder.

- **GreatFlowers is the default project.** It keeps its original environment variables, `data/`
  folder, S3 prefix and cron times. `src/golden.test.ts` proves its prompts, overlays, URLs and
  payloads are byte-identical to the pre-multi-project code.
- **Other projects** read the same settings with their own prefix (`OPF_ADMIN_API_URL`,
  `OPF_META_PAGE_ID`, ...; see `.env.example`), store data in `data/projects/<id>/`, and are off
  until enabled (`OPF_ENABLED=true`).
- **API requests** name their project with the `X-Project-Id` header (or `?project=` for images).
  Without one, the request is for GreatFlowers. `GET /api/projects` lists the enabled projects.
- **Dashboard:** a project dropdown appears in the header when more than one project is enabled.
  Switching reloads the workspace for that brand; it is disabled while a generation is running.
- **Codex image generation is shared** by all projects (one global lock), so each project's
  content crons run in a separate time window.

### Adding a project

1. Copy `src/projects/onepriceflowers.ts`, fill in the brand, and add it to `PROJECTS` in
   `src/projects/index.ts`.
2. Add its prefixed settings to `.env` (admin API user, Meta page/Instagram/token, GA4 property,
   S3 bucket and keys). New brands start in safe mode: no timed drafts until `<PREFIX>_*_AUTOGENERATE=true`,
   and posts stay hidden until `<PREFIX>_*_PUBLISH_LIVE=true`. Check it with
   `npm run check:project -- <id> --s3-write-test` (see DEPLOYMENT.md for the full runbook).
3. Create its Hermes skills (`<id>-marketing-strategist`, `<id>-content-entries`) on the Hermes host.
4. Give its cron jobs a window that does not overlap any other project.
5. Run `npm test`: `src/projects.test.ts` checks that no other brand's name or colours leak in.
