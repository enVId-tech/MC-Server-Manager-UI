# MC Server Creator & Manager

A comprehensive web application for creating, deploying, and managing Minecraft servers with advanced configuration options, real-time monitoring, and automated infrastructure management.

## 🚀 Overview

MC Server Creator is a full-stack Next.js application that provides users with a complete solution for managing Minecraft servers. From initial creation with custom configurations to ongoing management through an intuitive dashboard, this platform streamlines the entire server lifecycle.

## ✨ Key Features

### 🎮 Server Creation & Management
- **Comprehensive Server Builder**: Step-by-step wizard for creating custom Minecraft servers
- **Version Support**: Support for Minecraft versions 1.8 through 1.21+ with version-specific configurations
- **Multiple Server Types**: Vanilla, Spigot, Paper, Bukkit, Purpur, Forge, and Fabric support
- **Advanced Configuration**: Fine-grained control over server properties, world settings, and performance options
- **Plugin & Mod Support**: Upload and manage plugins (.jar files) for compatible server types
- **World Import**: Import existing world files or generate new worlds with custom seeds

### 🖥️ Dashboard & Monitoring
- **Real-time Server Status**: Live monitoring of server online/offline status and player counts
- **Server Actions**: Start, stop, and manage servers directly from the dashboard
- **Server Settings**: Modify server configurations post-creation
- **Advanced Deletion Protection**: Multi-step deletion confirmation requiring server IP verification
- **Backup Downloads**: Optional server backup download before deletion (API endpoint ready)
- **Progress Tracking**: Staged progress bars for both server creation and deletion processes
- **Auto-refresh**: Automatic dashboard refresh after successful operations

### 🔐 Authentication & Security
- **JWT-based Authentication**: Secure session management with HTTP-only cookies
- **User Registration**: Account creation with email validation
- **Protected Routes**: Automatic authentication checks and redirects
- **Session Persistence**: Maintain login state across browser sessions

### 🌐 Infrastructure Integration
- **Portainer Integration**: Automated Docker container management
- **DNS Management**: Automatic SRV record creation and deletion via Porkbun API
- **Dynamic Deployment**: Automatic server deployment with Docker Compose generation
- **Resource Management**: Memory calculation based on plugins/mods and server requirements
- **Subdomain Creation**: Automatic subdomain setup for easy server connectivity

### 🎨 User Experience
- **Progressive UI**: Loading states and progress indicators for all operations
- **Responsive Design**: Mobile-first design that works across all device sizes
- **Real-time Feedback**: Live progress tracking for server creation and deletion with step-by-step indicators
- **Advanced Modals**: Sophisticated confirmation dialogs with multi-step verification
- **Error Handling**: Comprehensive error messages and recovery options
- **Auto-redirects**: Smooth transitions between pages after successful operations
- **Accessibility**: WCAG-compliant interface with proper focus management

## 🛠️ Technology Stack

### Frontend
- **Next.js 15+** - React framework with App Router
- **TypeScript** - Type-safe development
- **SCSS Modules** - Component-scoped styling
- **React Icons** - Comprehensive icon library
- **Responsive Design** - Mobile-first approach

### Backend
- **Next.js API Routes** - Serverless backend functions
- **MongoDB** - NoSQL database with Mongoose ODM
- **JWT** - JSON Web Token authentication
- **bcrypt** - Password hashing and security

### Infrastructure & DevOps
- **Docker** - Containerization for Minecraft servers
- **Portainer** - Container management and orchestration with dynamic Docker Compose generation
- **Porkbun API** - DNS and subdomain management
- **Environment Configuration** - Secure credential management

### Development Tools
- **ESLint** - Code linting and quality enforcement
- **TypeScript** - Static type checking
- **Git** - Version control
- **Modern JavaScript** - ES6+ features and async/await patterns

## 🚦 Getting Started

### Prerequisites
- **Node.js** (v18.0.0 or higher)
- **MongoDB** instance (local or MongoDB Atlas)
- **Docker** (for server deployment)
- **Portainer** instance (for container management)
- **Porkbun Account** (for DNS management) - Optional

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd MinecraftServerCreator
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   Create a `.env.local` file in the root directory:
   ```env
   # Database Configuration
   MONGODB_URI=mongodb://localhost:27017/minecraft-servers
   # or for MongoDB Atlas:
   # MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/minecraft-servers

   # Authentication
   JWT_SECRET=your-super-secure-jwt-secret-key-here

   # Portainer Configuration (Optional)
   PORTAINER_URL=https://your-portainer-instance.com:9443
   PORTAINER_API_KEY=ptr_your_generated_api_key_here

   # Porkbun DNS Configuration (Optional)
   PORKBUN_API_KEY=pk1_your_api_key_here
   PORKBUN_SECRET_KEY=sk1_your_secret_key_here

   # Server Configuration
   FOLDER_PATH=/servers/otherServers
   NODE_ENV=development
   ```

4. **Database Setup**
   ```bash
   # The application will automatically connect to MongoDB
   # Ensure your MongoDB instance is running
   npm run dev
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```

   The application will be available at `http://localhost:3000`

### Production Deployment

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Start production server**
   ```bash
   npm start
   ```

3. **Docker Deployment** (Optional)
   ```bash
   # Build Docker image
   docker build -t minecraft-server-creator .
   
   # Run with Docker Compose
   docker-compose up -d
   ```

## 📁 Project Structure

```
MinecraftServerCreator/
├── app/                          # Next.js App Router
│   ├── _components/              # Reusable UI components
│   │   ├── Error/               # Error handling components
│   │   ├── HeroSection.tsx      # Landing page hero
│   │   ├── Inputs/              # Form input components
│   │   │   ├── CheckboxGroup/   # Checkbox group component
│   │   │   ├── FileUpload/      # File upload handling
│   │   │   ├── PreviewDetail/   # Configuration preview
│   │   │   ├── RadioGroup/      # Radio button groups
│   │   │   ├── RangeInput/      # Slider inputs
│   │   │   └── TabButton/       # Tab navigation
│   │   └── Navbar/              # Navigation component
│   ├── api/                     # Backend API routes
│   │   ├── auth/               # Authentication endpoints
│   │   │   ├── check/          # Session verification
│   │   │   ├── login/          # User login
│   │   │   ├── logout/         # User logout
│   │   │   └── signup/         # User registration
│   │   └── server/             # Server management API
│   │       ├── config/         # Server configuration
│   │       └── route.ts        # Server CRUD operations
│   ├── auth/                   # Authentication pages
│   │   ├── login/              # Login page
│   │   └── signup/             # Registration page
│   ├── generate/               # Legacy server generation
│   ├── get-started/           # Onboarding page
│   └── manager/               # Server management
│       ├── dashboard/         # Main dashboard
│       └── servers/           # Server-specific pages
│           └── create/        # Server creation wizard
├── lib/                        # Utility libraries
│   ├── db/                    # Database utilities
│   │   ├── bodyParser.ts      # Request body parsing
│   │   ├── dbConnect.ts       # MongoDB connection
│   │   ├── dbUpdater.ts       # Schema updates
│   │   └── global.ts          # Global database types
│   ├── objects/               # Data models
│   │   ├── Server.ts          # Server model
│   │   ├── ServerConfig.ts    # Configuration model
│   │   └── User.ts            # User model
│   └── server/                # External service integrations
│       ├── minecraft.ts       # Minecraft-specific utilities
│       ├── porkbun.ts        # DNS management
│       └── portainer.ts      # Container management
├── public/                    # Static assets
├── scripts/                   # Utility scripts
└── styles/                    # Global styles
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/signup` - Register a new user account
- `POST /api/auth/login` - Authenticate user credentials
- `GET /api/auth/check` - Verify current session status
- `POST /api/auth/logout` - End user session

### Server Management
- `GET /api/server` - Retrieve user's servers
- `POST /api/server/config` - Create new server configuration
- `GET /api/server/config` - Get server configuration options
- `DELETE /api/server` - Delete a server instance with progress tracking
- `GET /api/server/download/{id}` - Download server backup (TODO)

### Account Management
- `GET /api/account` - Get user account information
- `PUT /api/account` - Update user account details
- `DELETE /api/account` - Delete user account and all associated servers

## 🔧 Configuration Options

### Server Types Supported
- **Vanilla** - Official Minecraft server
- **Spigot** - Plugin-compatible server
- **Paper** - High-performance Spigot fork
- **Bukkit** - Original plugin platform
- **Purpur** - Feature-rich Paper fork
- **Forge** - Mod-compatible server
- **Fabric** - Lightweight mod platform

### Minecraft Versions
- **Legacy Support**: Minecraft 1.8+
- **Current Support**: Up to Minecraft 1.21.6
- **Version-Specific Features**: Automatic configuration based on selected version with versioned property interfaces
- **Property Validation**: Server properties validated against version capabilities

### Advanced Configuration
- **World Settings**: Custom seeds, world types, structure generation
- **Performance Tuning**: View distance, simulation distance, memory allocation
- **Player Management**: Whitelist, operator permissions, player limits

## 🌐 DNS Management & Automatic SRV Records

The application includes automatic DNS management through Porkbun API integration, creating SRV records for easy server connectivity.

### How It Works

When you create a Minecraft server, the system automatically:
1. **Creates SRV Record**: Generates `_minecraft._tcp.{subdomain}.{domain}` pointing to your server
2. **Stores DNS Info**: Saves DNS record details in the server database record
3. **Handles Cleanup**: Automatically removes DNS records when servers are deleted

### Configuration

Set up the following environment variables for DNS functionality:

```env
# Porkbun DNS Configuration
PORKBUN_API_KEY=pk1_your_api_key_here
PORKBUN_SECRET_KEY=sk1_your_secret_key_here

# DNS Configuration for Minecraft Servers
MINECRAFT_DOMAIN=yourdomain.com
SERVER_TARGET=your-server-ip-or-hostname.com
```

### Example Usage

With the configuration:
- `MINECRAFT_DOMAIN=example.com`
- `SERVER_TARGET=mc.example.com`
- Server subdomain: `survival`
- Server port: `25565`

**Created SRV Record**: `_minecraft._tcp.survival.example.com` → `mc.example.com:25565`

**Player Connection**: Players can connect using just `survival.example.com`

### DNS Record Format

The system creates standard Minecraft SRV records:
```
Name: _minecraft._tcp.{subdomain}
Type: SRV
Content: 0 5 {port} {target}
TTL: 300 (5 minutes)
```

### Manual DNS Management

If you need to manage DNS records manually, the PorkbunService provides methods:
- `createMinecraftSrvRecord()` - Create SRV record for Minecraft server
- `deleteMinecraftSrvRecord()` - Remove SRV record by subdomain
- `createDnsRecord()` - Generic DNS record creation
- `deleteDnsRecord()` - Generic DNS record deletion

### Troubleshooting DNS

1. **Records Not Creating**: Verify Porkbun API credentials and domain ownership
2. **Connection Issues**: Check that `SERVER_TARGET` resolves to your server IP
3. **TTL Considerations**: DNS changes may take up to 5 minutes to propagate
4. **Manual Cleanup**: If automatic deletion fails, records can be removed via Porkbun dashboard
- **Server Security**: Online mode, RCON configuration, proxy protection
- **Resource Packs**: Custom resource pack URLs and enforcement

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Use SCSS modules for styling
- Implement proper error handling
- Write comprehensive commit messages
- Test all authentication flows
- Ensure mobile responsiveness

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## ⚠️ Legal Disclaimer

This website and repository/codebase is not an official Minecraft website and is not associated with Mojang Studios or Microsoft. All product and company names are trademarks or registered trademarks of their respective holders. Use of these names does not imply any affiliation or endorsement by them.

## 🙏 Acknowledgments

- **itzg/minecraft-server** - Docker image for Minecraft server deployment
- **Portainer** - Container management platform
- **Porkbun** - DNS management services
- **MongoDB** - Database platform
- **Next.js Team** - Framework development
- **React Community** - Component libraries and tools