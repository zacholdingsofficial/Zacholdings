-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.projects (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  tag text,
  startDate text,
  dueDate text,
  attachments integer DEFAULT 0,
  comments integer DEFAULT 0,
  color text DEFAULT 'bg-indigo-100 text-indigo-700 ring-indigo-600/20'::text,
  status text DEFAULT 'Planning'::text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  company_id bigint,
  customer_id bigint,
  assigned_to bigint,
  priority text DEFAULT 'Medium'::text,
  total_value numeric DEFAULT 0,
  advance_paid numeric DEFAULT 0,
  assignee_ids ARRAY DEFAULT '{}'::bigint[],
  pending_status text,
  status_requested_by bigint,
  approval_date date,
  description text,
  due_date date,
  name text,
  expected_amount numeric DEFAULT 0,
  internal_company_id bigint,
  drive_folder_url text,
  milestones jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT projects_pkey PRIMARY KEY (id),
  CONSTRAINT projects_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT projects_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT projects_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.employees(id),
  CONSTRAINT projects_status_requested_by_fkey FOREIGN KEY (status_requested_by) REFERENCES public.employees(id),
  CONSTRAINT projects_internal_company_id_fkey FOREIGN KEY (internal_company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.employees (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL,
  role text,
  email text,
  phone text,
  age text,
  proofId text,
  initial text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  company_id bigint,
  access_level text DEFAULT 'user'::text,
  salary numeric DEFAULT 0,
  department text,
  profile_image_url text,
  password text DEFAULT 'password123'::text,
  CONSTRAINT employees_pkey PRIMARY KEY (id),
  CONSTRAINT employees_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.customers (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL,
  contact text,
  projects integer DEFAULT 0,
  spent text DEFAULT '$0'::text,
  status text DEFAULT 'Onboarding'::text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  company_id bigint,
  phone text,
  email text,
  contact_person text,
  address text,
  profile_image_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT customers_pkey PRIMARY KEY (id),
  CONSTRAINT customers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.companies (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL,
  head_name text,
  area text,
  phone text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  logo_url text,
  website_url text,
  backup_interval_days integer DEFAULT 7,
  last_backup_date timestamp with time zone,
  business_type text,
  allow_head_finance boolean DEFAULT true,
  CONSTRAINT companies_pkey PRIMARY KEY (id),
  CONSTRAINT fk_business_type FOREIGN KEY (business_type) REFERENCES public.business_types(slug)
);
CREATE TABLE public.comments (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  project_id bigint,
  author_name text NOT NULL,
  text text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT comments_pkey PRIMARY KEY (id),
  CONSTRAINT comments_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.salary_payments (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  employee_id bigint,
  company_id bigint,
  amount numeric NOT NULL CHECK (amount >= 0::numeric),
  payment_month text NOT NULL,
  status text DEFAULT 'Paid'::text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  payment_date date,
  project_id bigint,
  payment_type text DEFAULT 'Standard'::text,
  notes text,
  CONSTRAINT salary_payments_pkey PRIMARY KEY (id),
  CONSTRAINT salary_payments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT salary_payments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT salary_payments_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.messages (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  sender_id bigint,
  receiver_id bigint,
  content text NOT NULL,
  is_read boolean DEFAULT false,
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.employees(id),
  CONSTRAINT messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.employees(id)
);
CREATE TABLE public.project_tasks (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  project_id bigint,
  title text NOT NULL,
  is_completed boolean DEFAULT false,
  assignee_id bigint,
  created_at timestamp with time zone DEFAULT now(),
  deadline date,
  status text DEFAULT 'Pending'::text,
  CONSTRAINT project_tasks_pkey PRIMARY KEY (id),
  CONSTRAINT project_tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT project_tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.employees(id)
);
CREATE TABLE public.project_reports (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  project_id bigint,
  employee_id bigint,
  report_text text,
  rating integer CHECK (rating >= 0 AND rating <= 10),
  created_at timestamp with time zone DEFAULT now(),
  entries jsonb DEFAULT '[]'::jsonb,
  CONSTRAINT project_reports_pkey PRIMARY KEY (id),
  CONSTRAINT project_reports_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT project_reports_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);
CREATE TABLE public.announcements (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  target_company_id bigint,
  CONSTRAINT announcements_pkey PRIMARY KEY (id),
  CONSTRAINT announcements_target_company_id_fkey FOREIGN KEY (target_company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.expenses (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  company_id bigint,
  category text NOT NULL,
  description text,
  amount numeric NOT NULL DEFAULT 0,
  expense_date date DEFAULT CURRENT_DATE,
  created_by bigint,
  created_at timestamp with time zone DEFAULT now(),
  project_id bigint,
  status text DEFAULT 'Completed'::text,
  due_date date,
  CONSTRAINT expenses_pkey PRIMARY KEY (id),
  CONSTRAINT expenses_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.employees(id),
  CONSTRAINT expenses_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.invoices (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  company_id bigint,
  customer_id bigint,
  project_id bigint,
  invoice_number text NOT NULL,
  issue_date date DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  subtotal numeric DEFAULT 0,
  tax_rate numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  total_amount numeric DEFAULT 0 CHECK (total_amount >= 0::numeric),
  amount_paid numeric DEFAULT 0,
  status text DEFAULT 'Pending'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT invoices_pkey PRIMARY KEY (id),
  CONSTRAINT invoices_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT invoices_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.invoice_items (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  invoice_id bigint,
  description text NOT NULL,
  quantity numeric DEFAULT 1,
  rate numeric DEFAULT 0,
  total numeric DEFAULT 0,
  CONSTRAINT invoice_items_pkey PRIMARY KEY (id),
  CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id)
);
CREATE TABLE public.invoice_payments (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  invoice_id bigint,
  company_id bigint,
  amount numeric NOT NULL,
  payment_date date DEFAULT CURRENT_DATE,
  payment_method text DEFAULT 'Bank Transfer'::text,
  reference_note text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT invoice_payments_pkey PRIMARY KEY (id),
  CONSTRAINT invoice_payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id),
  CONSTRAINT invoice_payments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.project_allocations (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  project_id bigint,
  employee_id bigint,
  allocated_amount numeric DEFAULT 0,
  incentive_amount numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT project_allocations_pkey PRIMARY KEY (id),
  CONSTRAINT project_allocations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT project_allocations_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);
CREATE TABLE public.business_types (
  slug text NOT NULL,
  label text NOT NULL,
  CONSTRAINT business_types_pkey PRIMARY KEY (slug)
);