import { create } from "zustand";
import { supabase } from "../supabase";
import { useAuthStore } from "./authStore";

interface DataState {
  companies: any[]; projects: any[]; tasks: any[]; reports: any[]; employees: any[]; customers: any[]; invoices: any[]; invoiceItems: any[]; invoicePayments: any[]; messages: any[]; salaryPayments: any[]; announcements: any[]; expenses: any[]; projectAllocations: any[]; isLoading: boolean;
  fetchAllData: () => Promise<void>;
}

export const useDataStore = create<DataState>((set) => ({
  companies: [], projects: [], tasks: [], reports: [], employees: [], customers: [], invoices: [], invoiceItems: [], invoicePayments: [], messages: [], salaryPayments: [], announcements: [], expenses: [], projectAllocations: [], isLoading: false,

  fetchAllData: async () => {
    set({ isLoading: true });
    
    const { role, companyId, activeWorkspace, permissions } = useAuthStore.getState();
    const targetCompanyId = (role === 'admin' && activeWorkspace) ? activeWorkspace : (role !== 'admin' ? companyId : null);

    const hasFinancialAccess = role === 'admin' || (role === 'head' && permissions?.canViewFinancials !== false);

    try {
      let companiesQuery = supabase.from('companies').select('*');
      let projectsQuery = supabase.from('projects').select('*');
      let tasksQuery = supabase.from('project_tasks').select('*');
      let reportsQuery = supabase.from('project_reports').select('*');
      // Fetch all employees so the nested junction table controls visibility in the UI securely
      let employeesQuery = supabase.from('employees').select('*, company_roles:employee_company_roles(*)');
      let customersQuery = supabase.from('customers').select('*');
      let messagesQuery = supabase.from('messages').select('*').order('created_at', { ascending: true });
      let announcementsQuery = supabase.from('announcements').select('*').order('created_at', { ascending: false });
      let allocationsQuery = supabase.from('project_allocations').select('*');

      let invoicesQuery = supabase.from('invoices').select('*').order('created_at', { ascending: false });
      let invoiceItemsQuery = supabase.from('invoice_items').select('*');
      let invoicePaymentsQuery = supabase.from('invoice_payments').select('*').order('created_at', { ascending: false });
      let expensesQuery = supabase.from('expenses').select('*');
      let salaryQuery = supabase.from('salary_payments').select('*').order('created_at', { ascending: false });

      if (targetCompanyId) {
        companiesQuery = companiesQuery.eq('id', targetCompanyId);
        projectsQuery = projectsQuery.eq('company_id', targetCompanyId);
        tasksQuery = tasksQuery.eq('company_id', targetCompanyId); 
        reportsQuery = reportsQuery.eq('company_id', targetCompanyId); 
        customersQuery = customersQuery.eq('company_id', targetCompanyId);
        messagesQuery = messagesQuery.eq('company_id', targetCompanyId); 
        announcementsQuery = announcementsQuery.eq('company_id', targetCompanyId); 
        allocationsQuery = allocationsQuery.eq('company_id', targetCompanyId); 
        
        // MODIFIED: The legacy company_id filter has been removed to allow multi-tenant users 
        // to appear in secondary companies correctly.

        if (hasFinancialAccess) {
          invoicesQuery = invoicesQuery.eq('company_id', targetCompanyId);
          invoiceItemsQuery = invoiceItemsQuery.eq('company_id', targetCompanyId); 
          invoicePaymentsQuery = invoicePaymentsQuery.eq('company_id', targetCompanyId);
          expensesQuery = expensesQuery.eq('company_id', targetCompanyId);
          salaryQuery = salaryQuery.eq('company_id', targetCompanyId); 
        }
      }

      const corePromises = [
        companiesQuery, projectsQuery, tasksQuery, reportsQuery, employeesQuery, 
        customersQuery, messagesQuery, announcementsQuery, allocationsQuery
      ];
      
      const financialPromises = hasFinancialAccess 
        ? [invoicesQuery, invoiceItemsQuery, invoicePaymentsQuery, salaryQuery, expensesQuery] 
        : [Promise.resolve({ data: [] }), Promise.resolve({ data: [] }), Promise.resolve({ data: [] }), Promise.resolve({ data: [] }), Promise.resolve({ data: [] })];

      const [
        { data: companies }, { data: projects }, { data: tasks }, { data: reports }, { data: employees },
        { data: customers }, { data: messages }, { data: announcements }, { data: allocations },
        { data: invoices }, { data: invoiceItems }, { data: invoicePayments }, { data: salaryPayments }, { data: expenses }
      ] = await Promise.all([...corePromises, ...financialPromises]);

      set({
        companies: companies || [], projects: projects || [], tasks: tasks || [], reports: reports || [], employees: employees || [],
        customers: customers || [], messages: messages || [], announcements: announcements || [], projectAllocations: allocations || [],
        invoices: invoices || [], invoiceItems: invoiceItems || [], invoicePayments: invoicePayments || [], salaryPayments: salaryPayments || [], expenses: expenses || [], 
        isLoading: false
      });
    } catch (error) {
      console.error("Error fetching data:", error);
      set({ isLoading: false });
    }
  }
}));