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
    const { role, companyId, activeWorkspace } = useAuthStore.getState();
    const targetCompanyId = (role === 'admin' && activeWorkspace) ? activeWorkspace : (role !== 'admin' ? companyId : null);

    try {
      let companiesQuery = supabase.from('companies').select('*');
      let projectsQuery = supabase.from('projects').select('*');
      let tasksQuery = supabase.from('project_tasks').select('*');
      let reportsQuery = supabase.from('project_reports').select('*');
      
      // --- MODIFIED: Fetching nested junction table data for multiple roles ---
      let employeesQuery = supabase.from('employees').select('*, company_roles:employee_company_roles(*)');
      
      let customersQuery = supabase.from('customers').select('*');
      let invoicesQuery = supabase.from('invoices').select('*').order('created_at', { ascending: false });
      let invoiceItemsQuery = supabase.from('invoice_items').select('*');
      let invoicePaymentsQuery = supabase.from('invoice_payments').select('*').order('created_at', { ascending: false });
      let expensesQuery = supabase.from('expenses').select('*');
      let messagesQuery = supabase.from('messages').select('*').order('created_at', { ascending: true });
      let salaryQuery = supabase.from('salary_payments').select('*').order('created_at', { ascending: false });
      let announcementsQuery = supabase.from('announcements').select('*').order('created_at', { ascending: false });
      let allocationsQuery = supabase.from('project_allocations').select('*');

      if (targetCompanyId) {
        companiesQuery = companiesQuery.eq('id', targetCompanyId);
        projectsQuery = projectsQuery.eq('company_id', targetCompanyId);
        customersQuery = customersQuery.eq('company_id', targetCompanyId);
        invoicesQuery = invoicesQuery.eq('company_id', targetCompanyId);
        invoicePaymentsQuery = invoicePaymentsQuery.eq('company_id', targetCompanyId);
        expensesQuery = expensesQuery.eq('company_id', targetCompanyId);
        
        // NOTE: This filter uses the legacy columns to maintain backward compatibility during migration. 
        // If you eventually drop the old company_id column from the employees table, you will need to 
        // remove this specific line and rely on the frontend filtering logic we added to EmployeesPage.
        employeesQuery = employeesQuery.or(`company_id.eq.${targetCompanyId},access_level.eq.admin`);
      }

      const [ 
        { data: companies }, { data: projects }, { data: tasks }, { data: reports }, { data: employees }, 
        { data: customers }, { data: invoices }, { data: invoiceItems }, { data: invoicePayments }, { data: messages }, 
        { data: salaryPayments }, { data: announcements }, { data: expenses }, { data: allocations } 
      ] = await Promise.all([
        companiesQuery, projectsQuery, tasksQuery, reportsQuery, employeesQuery, customersQuery, invoicesQuery, 
        invoiceItemsQuery, invoicePaymentsQuery, messagesQuery, salaryQuery, announcementsQuery, expensesQuery, allocationsQuery
      ]);

      set({
        companies: companies || [], projects: projects || [], tasks: tasks || [], reports: reports || [], employees: employees || [],
        customers: customers || [], invoices: invoices || [], invoiceItems: invoiceItems || [], invoicePayments: invoicePayments || [], 
        messages: messages || [], salaryPayments: salaryPayments || [], announcements: announcements || [], expenses: expenses || [], 
        projectAllocations: allocations || [], isLoading: false
      });
    } catch (error) {
      console.error("Error fetching data:", error);
      set({ isLoading: false });
    }
  }
}));