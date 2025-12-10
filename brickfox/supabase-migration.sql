-- PIMPilot Supabase Migration Script
-- Führen Sie dieses Script im Supabase SQL Editor aus

-- 1. Erstelle users Tabelle (wird mit Supabase Auth verknüpft)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  username TEXT,
  is_admin BOOLEAN DEFAULT FALSE,
  
  -- Stripe subscription fields
  stripe_customer_id TEXT,
  subscription_status TEXT,
  subscription_id TEXT,
  plan_id TEXT,
  current_period_end TIMESTAMPTZ,
  
  -- Usage tracking for API limits
  api_calls_used INTEGER DEFAULT 0,
  api_calls_limit INTEGER DEFAULT 100,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Erstelle projects Tabelle
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Erstelle products_in_projects Tabelle
CREATE TABLE IF NOT EXISTS public.products_in_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT,
  files JSONB,
  html_code TEXT,
  preview_text TEXT,
  extracted_data JSONB,
  template TEXT,
  custom_attributes JSONB,
  exact_product_name TEXT,
  article_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Erstelle templates Tabelle
CREATE TABLE IF NOT EXISTS public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Erstelle suppliers Tabelle
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url_pattern TEXT,
  description TEXT,
  selectors JSONB NOT NULL,
  product_link_selector TEXT,
  session_cookies TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Erstelle scrape_session Tabelle
CREATE TABLE IF NOT EXISTS public.scrape_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scraped_products JSONB NOT NULL,
  scraped_product JSONB,
  generated_description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Erstelle Indexes für Performance
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_products_project_id ON public.products_in_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_user_id ON public.suppliers(user_id);
CREATE INDEX IF NOT EXISTS idx_scrape_session_user_id ON public.scrape_session(user_id);

-- 8. Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products_in_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_session ENABLE ROW LEVEL SECURITY;

-- 9. RLS Policies für users Tabelle
CREATE POLICY "Users can view own profile"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins können alle User sehen
CREATE POLICY "Admins can view all users"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND is_admin = TRUE
    )
  );

-- 10. RLS Policies für projects
CREATE POLICY "Users can view own projects"
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own projects"
  ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own projects"
  ON public.projects
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own projects"
  ON public.projects
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 11. RLS Policies für products_in_projects
CREATE POLICY "Users can view own products"
  ON public.products_in_projects
  FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create products in own projects"
  ON public.products_in_projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update products in own projects"
  ON public.products_in_projects
  FOR UPDATE
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete products in own projects"
  ON public.products_in_projects
  FOR DELETE
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

-- 12. RLS Policies für templates (public read, admin write)
CREATE POLICY "Everyone can view templates"
  ON public.templates
  FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "Admins can manage templates"
  ON public.templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND is_admin = TRUE
    )
  );

-- 13. RLS Policies für suppliers
CREATE POLICY "Users can view own suppliers"
  ON public.suppliers
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own suppliers"
  ON public.suppliers
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own suppliers"
  ON public.suppliers
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own suppliers"
  ON public.suppliers
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 14. RLS Policies für scrape_session
CREATE POLICY "Users can view own scrape sessions"
  ON public.scrape_session
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own scrape sessions"
  ON public.scrape_session
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own scrape sessions"
  ON public.scrape_session
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own scrape sessions"
  ON public.scrape_session
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 15. Trigger für updated_at Timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scrape_session_updated_at
  BEFORE UPDATE ON public.scrape_session
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 16. Funktion zum Erstellen eines Users nach Auth Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger auf auth.users um automatisch einen Eintrag in public.users zu erstellen
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- FERTIG! 🎉
-- Ihr Supabase-Schema ist jetzt bereit für PIMPilot
