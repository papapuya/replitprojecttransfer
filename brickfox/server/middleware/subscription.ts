import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';

// Check if user is authenticated
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentifizierung erforderlich' });
  }
  next();
}

// Check if user has an active subscription
export function requireSubscription(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentifizierung erforderlich' });
  }

  const user = req.user as any;

  if (!user.subscriptionStatus || user.subscriptionStatus === 'canceled') {
    return res.status(403).json({ 
      error: 'Aktives Abonnement erforderlich',
      message: 'Um diese Funktion zu nutzen, benötigen Sie ein aktives Abonnement.',
      upgradeUrl: '/pricing'
    });
  }

  if (user.subscriptionStatus === 'past_due') {
    return res.status(403).json({ 
      error: 'Zahlung überfällig',
      message: 'Ihre Zahlung ist überfällig. Bitte aktualisieren Sie Ihre Zahlungsmethode.',
      updateUrl: '/account'
    });
  }

  next();
}

// Check if user has reached their API call limit
export async function checkApiLimit(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentifizierung erforderlich' });
  }

  const user = req.user as any;

  // Get fresh user data to ensure limits are up to date
  const freshUser = await storage.getUserById(user.id);
  
  if (!freshUser) {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }

  const apiCallsUsed = freshUser.apiCallsUsed || 0;
  const apiCallsLimit = freshUser.apiCallsLimit || 500;

  if (apiCallsUsed >= apiCallsLimit) {
    return res.status(429).json({
      error: 'API-Limit erreicht',
      message: `Sie haben Ihr monatliches Limit von ${apiCallsLimit} AI-Generierungen erreicht.`,
      apiCallsUsed,
      apiCallsLimit,
      upgradeUrl: '/pricing'
    });
  }

  // Update user object in request with fresh data
  req.user = freshUser;
  
  next();
}

// Track API usage after successful request
export async function trackApiUsage(req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);

  res.json = function(body: any) {
    // Only track if request was successful (2xx status)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (req.isAuthenticated()) {
        const user = req.user as any;
        
        // Increment API calls asynchronously (don't block response)
        storage.incrementApiCalls(user.id).catch(err => {
          console.error('Error tracking API usage:', err);
        });
      }
    }

    return originalJson(body);
  };

  next();
}

// Combined middleware for AI-powered endpoints
export function requireActiveSubscriptionWithLimit(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, (err) => {
    if (err) return next(err);
    
    requireSubscription(req, res, (err) => {
      if (err) return next(err);
      
      checkApiLimit(req, res, next);
    });
  });
}

// Check if user is admin
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentifizierung erforderlich' });
  }

  const user = req.user as any;

  // Get fresh user data to check admin status
  const freshUser = await storage.getUserById(user.id);
  
  if (!freshUser || !freshUser.isAdmin) {
    return res.status(403).json({ 
      error: 'Zugriff verweigert',
      message: 'Nur Administratoren haben Zugriff auf diesen Bereich.'
    });
  }

  next();
}
