# Incremental Migration: Express.js → TypeScript + Hono

This document outlines the incremental migration strategy for transforming text.pollinations.ai from Express.js to TypeScript with a Hono-inspired architecture, following the successful pattern from image.pollinations.ai.

## Migration Status

### ✅ Phase 1: Foundation Setup (COMPLETED)
- [x] TypeScript configuration (`tsconfig.json`)
- [x] Updated `package.json` with TypeScript dependencies
- [x] Core type definitions (`src/types/index.ts`)
- [x] HTTP utilities (`src/utils/http.ts`)
- [x] Middleware system (`src/middleware/`)
- [x] Basic TypeScript server (`src/index.ts`)

### 🔄 Phase 2: Parallel Operation (CURRENT)
The new TypeScript server runs alongside the existing Express server:
- **Express server**: `npm start` (port 16385)
- **TypeScript server**: `npm run start:ts` (port 16386)

### 📋 Phase 3: Gradual Migration (NEXT)
1. **Route-by-route migration**: Move endpoints from Express to TypeScript
2. **Middleware consolidation**: Replace Express middleware with TypeScript equivalents
3. **Testing parity**: Ensure identical behavior between both servers
4. **Performance validation**: Compare response times and resource usage

### 🎯 Phase 4: Full Transition (FUTURE)
1. **Switch default port**: Make TypeScript server primary
2. **Remove Express dependencies**: Clean up old code
3. **Documentation updates**: Update all references

## Architecture Comparison

### Current Express.js Architecture
```
server.js (931 lines)
├── Express middleware chain
├── Route handlers mixed with business logic
├── Authentication scattered throughout
└── Manual error handling
```

### New TypeScript Architecture
```
src/
├── types/index.ts          # Centralized type definitions
├── utils/http.ts           # HTTP utilities
├── middleware/
│   ├── cors.ts            # CORS handling
│   └── auth.ts            # Authentication middleware
└── index.ts               # Main server with clean routing
```

## Key Benefits

### 1. **Type Safety**
- Compile-time error detection
- Better IDE support and autocomplete
- Reduced runtime errors

### 2. **Modular Architecture**
- Clear separation of concerns
- Reusable middleware components
- Easier testing and maintenance

### 3. **Performance**
- Native Node.js HTTP server (no Express overhead)
- Optimized request handling
- Better memory management

### 4. **Maintainability**
- Smaller, focused files
- Clear dependency structure
- Consistent error handling

## Running Both Servers

### Express Server (Current Production)
```bash
npm start                    # Port 16385
npm run debug               # With debug logs
```

### TypeScript Server (Development)
```bash
npm run start:ts            # Port 16386
npm run debug:ts            # With debug logs
npm run type-check          # Type checking only
```

## Migration Commands

### Install Dependencies
```bash
npm install                 # Install TypeScript deps
```

### Development Workflow
```bash
npm run type-check          # Check types
npm run start:ts            # Run TypeScript server
npm run debug:ts            # Debug TypeScript server
```

## Testing Migration

### 1. **Basic Functionality**
```bash
# Test models endpoint
curl http://localhost:16386/models

# Test text generation
curl -X POST http://localhost:16386/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"openai-fast","messages":[{"role":"user","content":"Hello"}]}'
```

### 2. **Compare Responses**
Run identical requests against both servers:
- Express: `http://localhost:16385`
- TypeScript: `http://localhost:16386`

### 3. **Performance Testing**
```bash
# Install Apache Bench
brew install httpd

# Test Express server
ab -n 100 -c 10 http://localhost:16385/models

# Test TypeScript server  
ab -n 100 -c 10 http://localhost:16386/models
```

## Migration Checklist

### Immediate Next Steps
- [ ] Fix remaining TypeScript import errors
- [ ] Test basic endpoints (models, chat completions)
- [ ] Validate authentication middleware
- [ ] Compare response formats

### Short Term (1-2 weeks)
- [ ] Migrate streaming responses
- [ ] Port ad system integration
- [ ] Add comprehensive error handling
- [ ] Implement feed endpoints

### Medium Term (1 month)
- [ ] Performance optimization
- [ ] Load testing comparison
- [ ] Security audit
- [ ] Documentation updates

### Long Term (2-3 months)
- [ ] Switch to TypeScript as primary
- [ ] Remove Express dependencies
- [ ] Clean up legacy code
- [ ] Update deployment scripts

## Troubleshooting

### Common Issues

1. **Import Errors**: Shared modules need proper TypeScript declarations
2. **Type Mismatches**: Gradual typing allows `any` types temporarily
3. **Middleware Order**: Ensure middleware chain matches Express behavior

### Debug Commands
```bash
DEBUG=pollinations:* npm run debug:ts    # Full debug logging
DEBUG=pollinations:server:ts npm run start:ts  # Server-only logs
```

## File Structure

### New TypeScript Files
- `src/types/index.ts` - Core type definitions
- `src/utils/http.ts` - HTTP utilities and helpers
- `src/middleware/cors.ts` - CORS middleware
- `src/middleware/auth.ts` - Authentication middleware
- `src/index.ts` - Main TypeScript server

### Existing Files (Unchanged)
- `server.js` - Original Express server
- `availableModels.js` - Model configurations
- `generateTextPortkey.js` - Text generation logic
- `shared/` - Shared utilities

## Success Metrics

### Performance
- Response time parity (±10ms)
- Memory usage improvement (target: -20%)
- CPU usage optimization

### Reliability
- Zero regression in functionality
- Improved error handling
- Better logging and debugging

### Developer Experience
- Type safety and IntelliSense
- Faster development cycles
- Easier onboarding for new developers

---

*This migration follows the "thin proxy" principle - maintaining minimal, focused code while improving architecture and type safety.*
