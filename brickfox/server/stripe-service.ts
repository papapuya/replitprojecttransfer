import Stripe from 'stripe';
import { supabaseStorage } from './supabase-storage';

// Stripe Configuration
const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.warn('⚠️ STRIPE_SECRET_KEY nicht konfiguriert - Stripe-Funktionen deaktiviert');
    return null;
  }
  return new Stripe(secretKey, {
    apiVersion: '2025-10-29.clover',
  });
};

// Subscription Plans Configuration
export const PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 29,
    currency: 'eur',
    apiCallsLimit: 15000, // GPT-4o-mini: 30× günstiger (500 → 15k)
    features: ['3000 Produkte/Monat', '15.000 AI-Generierungen (GPT-4o-mini)', 'CSV-Import', 'URL-Scraping'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 79,
    currency: 'eur',
    apiCallsLimit: 150000, // GPT-4o-mini: 30× günstiger (5k → 150k)
    features: ['30.000 Produkte/Monat', '150.000 AI-Generierungen (GPT-4o-mini)', 'Alle Starter-Features', 'Bulk-Processing', 'Vorrang-Support'],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 199,
    currency: 'eur',
    apiCallsLimit: 600000, // GPT-4o-mini: 30× günstiger (20k → 600k)
    features: ['Unbegrenzte Produkte', '600.000 AI-Generierungen (GPT-4o-mini)', 'Alle Pro-Features', 'Custom Templates', 'Dedizierter Support'],
  },
};

// Create Stripe Customer
export async function createStripeCustomer(userId: string, email: string) {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error('Stripe ist nicht konfiguriert');
  }
  
  const customer = await stripe.customers.create({
    email,
    metadata: {
      userId,
    },
  });
  
  await supabaseStorage.updateUserSubscription(userId, {
    stripeCustomerId: customer.id,
  });
  
  return customer;
}

// Create Checkout Session for Subscription
export async function createCheckoutSession(
  userId: string,
  email: string,
  planId: 'starter' | 'pro' | 'enterprise',
  successUrl: string,
  cancelUrl: string
) {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error('Stripe ist nicht konfiguriert. Bitte kontaktieren Sie den Administrator.');
  }
  const plan = PLANS[planId];
  
  if (!plan) {
    throw new Error(`Ungültiger Plan: ${planId}`);
  }
  
  // Get or create customer
  const user = await supabaseStorage.getUserById(userId);
  let customerId = user?.stripeCustomerId;
  
  if (!customerId) {
    const customer = await createStripeCustomer(userId, email);
    customerId = customer.id;
  }
  
  // Get or create price ID from environment
  const priceIdKey = `STRIPE_PRICE_${planId.toUpperCase()}` as const;
  let priceId = process.env[priceIdKey];
  
  // If no price ID in env, create one dynamically (for testing)
  if (!priceId) {
    const price = await stripe.prices.create({
      currency: plan.currency,
      unit_amount: plan.price * 100, // Convert to cents
      recurring: {
        interval: 'month',
      },
      product_data: {
        name: `PIMPilot ${plan.name}`,
      },
    });
    priceId = price.id;
    console.log(`⚠️ Dynamisch erstellte Price ID für ${planId}: ${priceId}`);
    console.log(`💡 Fügen Sie diese in .env hinzu: ${priceIdKey}=${priceId}`);
  }
  
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId,
      planId,
    },
  });
  
  return session;
}

// Create Customer Portal Session
export async function createPortalSession(customerId: string, returnUrl: string) {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error('Stripe ist nicht konfiguriert. Bitte kontaktieren Sie den Administrator.');
  }
  
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  
  return session;
}

// Handle Stripe Webhook Events
export async function handleWebhookEvent(event: Stripe.Event) {
  const stripe = getStripe();
  if (!stripe) {
    console.error('Stripe nicht konfiguriert - Webhook ignoriert');
    return;
  }
  
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const planId = session.metadata?.planId as 'starter' | 'pro' | 'enterprise';
      
      if (!userId || !planId) {
        console.error('Missing metadata in checkout.session.completed');
        return;
      }
      
      const plan = PLANS[planId];
      
      // Get subscription details
      if (session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        
        await supabaseStorage.updateUserSubscription(userId, {
          subscriptionStatus: 'active',
          subscriptionId: subscription.id,
          planId,
          currentPeriodEnd: new Date((subscription.current_period_end || 0) * 1000).toISOString(),
          apiCallsLimit: plan.apiCallsLimit,
        });
        
        console.log(`✅ Subscription activated for user ${userId}, plan: ${planId}`);
      }
      break;
    }
    
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
      
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const userId = subscription.metadata?.userId;
        
        if (userId) {
          await supabaseStorage.updateUserSubscription(userId, {
            subscriptionStatus: 'active',
            currentPeriodEnd: new Date((subscription.current_period_end || 0) * 1000).toISOString(),
          });
          
          // Reset API calls counter for new billing period
          await supabaseStorage.resetApiCalls(userId);
          
          console.log(`✅ Payment succeeded, subscription renewed for user ${userId}`);
        }
      }
      break;
    }
    
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
      
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const userId = subscription.metadata?.userId;
        
        if (userId) {
          await supabaseStorage.updateUserSubscription(userId, {
            subscriptionStatus: 'past_due',
          });
          
          console.log(`⚠️ Payment failed for user ${userId}`);
        }
      }
      break;
    }
    
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.userId;
      
      if (userId) {
        // Check if plan changed
        const priceId = subscription.items.data[0]?.price.id;
        let newPlanId: 'starter' | 'pro' | 'enterprise' | undefined;
        
        // Determine plan from price (this is a simplification, ideally store price->plan mapping)
        if (subscription.metadata?.planId) {
          newPlanId = subscription.metadata.planId as any;
        }
        
        await supabaseStorage.updateUserSubscription(userId, {
          subscriptionStatus: subscription.status,
          currentPeriodEnd: new Date((subscription.current_period_end || 0) * 1000).toISOString(),
          planId: newPlanId,
          apiCallsLimit: newPlanId ? PLANS[newPlanId].apiCallsLimit : undefined,
        });
        
        console.log(`✅ Subscription updated for user ${userId}, status: ${subscription.status}`);
      }
      break;
    }
    
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.userId;
      
      if (userId) {
        await supabaseStorage.updateUserSubscription(userId, {
          subscriptionStatus: 'canceled',
          subscriptionId: undefined,
          planId: undefined,
        });
        
        console.log(`❌ Subscription canceled for user ${userId}`);
      }
      break;
    }
    
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

// Get Subscription Status
export async function getSubscriptionStatus(userId: string) {
  const user = await supabaseStorage.getUserById(userId);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  const stripe = getStripe();
  let subscriptionDetails = null;
  
  // If Stripe is not configured, return user data without subscription details
  if (!stripe) {
    const planId = user.planId as keyof typeof PLANS | null;
    return {
      user: {
        subscriptionStatus: user.subscriptionStatus || 'trial',
        planId: user.planId || 'trial',
        apiCallsUsed: user.apiCallsUsed || 0,
        apiCallsLimit: user.apiCallsLimit || 50,
      },
      plan: planId && PLANS[planId] ? PLANS[planId] : {
        id: 'trial',
        name: 'Trial',
        price: 0,
        currency: 'eur',
        apiCallsLimit: 50, // Trial limit: 50 calls
        features: [
          '50 AI-Generierungen (Trial)',
          'Alle Features zum Testen',
          'Upgrade jederzeit möglich'
        ]
      },
      subscription: null
    };
  }
  
  if (user.subscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(user.subscriptionId);
      subscriptionDetails = {
        id: subscription.id,
        status: subscription.status,
        currentPeriodEnd: new Date((subscription.current_period_end || 0) * 1000).toISOString(),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      };
    } catch (error) {
      console.error('Error retrieving subscription:', error);
    }
  }
  
  return {
    user: {
      subscriptionStatus: user.subscriptionStatus,
      planId: user.planId,
      apiCallsUsed: user.apiCallsUsed,
      apiCallsLimit: user.apiCallsLimit,
      currentPeriodEnd: user.currentPeriodEnd,
    },
    subscription: subscriptionDetails,
    plan: user.planId ? PLANS[user.planId as keyof typeof PLANS] : null,
  };
}
