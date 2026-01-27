// utils/routeDebugger.js
// ========================================
// 🔍 ROUTE DEBUGGING UTILITY
// ========================================

const routeDebugHandler = (mountedRoutes, failedRoutes) => {
    return (req, res) => {
      const routes = [];
  
      function extractRoutes(stack, basePath = '') {
        stack.forEach(layer => {
          if (layer.route) {
            const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
            routes.push({
              path: basePath + layer.route.path,
              methods: methods,
              source: 'router'
            });
          } else if (layer.name === 'router' && layer.handle.stack) {
            let newBasePath = basePath;
            if (layer.regexp && layer.regexp.source) {
              const match = layer.regexp.source.match(/\\\/([^\\]+)/);
              if (match) {
                newBasePath = basePath + '/' + match[1];
              }
            }
            extractRoutes(layer.handle.stack, newBasePath);
          }
        });
      }
  
      // Extract all routes from app
      const app = req.app;
      app._router.stack.forEach(layer => {
        if (layer.route) {
          const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
          routes.push({
            path: layer.route.path,
            methods: methods,
            source: 'app'
          });
        } else if (layer.name === 'router' && layer.handle.stack) {
          let basePath = '';
          if (layer.regexp && layer.regexp.source) {
            const match = layer.regexp.source.match(/\\\/([^\\]+)/);
            if (match) {
              basePath = '/' + match[1];
            }
          }
          extractRoutes(layer.handle.stack, basePath);
        }
      });
  
      routes.sort((a, b) => a.path.localeCompare(b.path));
  
      // Group routes by category
      const groupedRoutes = {};
      routes.forEach(route => {
        const basePath = route.path.split('/')[1] || 'root';
        if (!groupedRoutes[basePath]) {
          groupedRoutes[basePath] = [];
        }
        groupedRoutes[basePath].push(route);
      });
  
      res.json({
        server: 'api.aced.live',
        timestamp: new Date().toISOString(),
        totalRoutes: routes.length,
        routeGroups: groupedRoutes,
        mountedRoutes: mountedRoutes.map(r => ({
          path: r.path,
          description: r.description
        })),
        failedRoutes: failedRoutes.map(r => ({
          path: r.path,
          description: r.description,
          error: r.error
        })),
        criticalEndpoints: {
          progress: [
            'POST /api/user-progress',
            'POST /api/progress',
            'POST /api/progress/quick-save'
          ],
          payments: [
            'POST /api/payments/payme',
            'POST /api/payments/initiate',
            'GET /api/payments/validate-user/:userId'
          ],
          users: [
            'POST /api/users/save',
            'GET /api/users/:userId',
            'PUT /api/users/:userId/status'
          ]
        }
      });
    };
  };
  
  module.exports = { routeDebugHandler };