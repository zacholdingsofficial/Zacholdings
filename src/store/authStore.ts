import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase } from "../supabase";

interface AuthState {
  user: any | null;
  role: 'admin' | 'head' | 'user' | null;
  companyId: number | null;
  employeeId: number | null;
  activeWorkspace: number | null;
  isLoading: boolean;
  permissions: { canViewFinancials: boolean } | null; 
  
  checkSession: () => Promise<void>;
  signIn: (email: string, password: string, selectedRole?: 'admin' | 'head' | 'user' | null, selectedCompanyId?: number | string | null) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  setActiveWorkspace: (id: number | string | null) => Promise<void>; // Added string to handle "" clear overrides
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null, 
      role: null, 
      companyId: null, 
      employeeId: null, 
      activeWorkspace: null, 
      isLoading: false,
      permissions: null,

      checkSession: async () => {
        set({ isLoading: true });
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          const { data: emp } = await supabase.from('employees').select('access_level, company_id, id').eq('email', session.user.email).single();
          
          const currentRole = get().role;
          const currentCompanyId = get().companyId;
          const currentWorkspace = get().activeWorkspace;
          
          const targetWorkspace = currentWorkspace || currentCompanyId || emp?.company_id || null;

          set({ 
            user: session.user, 
            employeeId: emp?.id || null, 
            role: currentRole || emp?.access_level || 'user', 
            companyId: currentCompanyId || emp?.company_id || null, 
            activeWorkspace: targetWorkspace
          }); 

          if (targetWorkspace) {
            await get().setActiveWorkspace(targetWorkspace);
          }
          
          set({ isLoading: false });
        } else {
          set({ user: null, role: null, companyId: null, employeeId: null, activeWorkspace: null, permissions: null, isLoading: false });
        }
      },

      signIn: async (email, password, selectedRole, selectedCompanyId) => {
        set({ isLoading: true });
        const { data: auth, error } = await supabase.auth.signInWithPassword({ email, password });
        
        if (error) { 
          set({ isLoading: false }); 
          return { error: error.message }; 
        }
        
        const { data: emp } = await supabase.from('employees').select('access_level, company_id, id').eq('email', email).single();
        
        const parsedCompanyId = selectedCompanyId ? Number(selectedCompanyId) : null;
        const initialCompanyId = parsedCompanyId || emp?.company_id || null;
        const initialRole = selectedRole || emp?.access_level || 'user';

        set({ 
          user: auth.user, 
          employeeId: emp?.id || null, 
          role: initialRole, 
          companyId: initialCompanyId, 
          activeWorkspace: initialCompanyId
        });

        if (initialCompanyId) {
            await get().setActiveWorkspace(initialCompanyId);
        }
        
        set({ isLoading: false });
        return { error: null };
      },

      signOut: async () => {
        await supabase.auth.signOut();
        set({ user: null, role: null, companyId: null, employeeId: null, activeWorkspace: null, permissions: null });
      },

      setActiveWorkspace: async (id) => {
        const empId = get().employeeId;

        // THE FIX: If exiting a workspace (null or ""), completely restore the user's BASE profile
        if (!id) {
            let baseRole: 'admin' | 'head' | 'user' = 'user';
            let baseCompanyId: number | null = null;
            
            if (empId) {
                const { data: emp } = await supabase.from('employees').select('access_level, company_id').eq('id', empId).single();
                if (emp) {
                    baseRole = emp.access_level as 'admin' | 'head' | 'user';
                    baseCompanyId = emp.company_id;
                }
            }
            
            // This properly clears the linger variables from local storage so the refresh bug is killed
            set({ 
                activeWorkspace: null, 
                companyId: baseCompanyId, 
                role: baseRole, 
                permissions: null 
            });
            return;
        }

        const parsedId = typeof id === 'string' ? parseInt(id, 10) : id;
        let newRole = get().role; 
        let canViewFinancials = true; 

        try {
            const { data: companyData } = await supabase
                .from('companies')
                .select('allow_head_finance') 
                .eq('id', parsedId)
                .single();
            
            if (companyData && companyData.allow_head_finance === false) {
                canViewFinancials = false;
            }

            if (empId) {
                const { data: roleData } = await supabase
                    .from('employee_company_roles')
                    .select('access_level') 
                    .eq('employee_id', empId)
                    .eq('company_id', parsedId)
                    .single();

                if (roleData && roleData.access_level) {
                    newRole = roleData.access_level as 'admin' | 'head' | 'user';
                }
            }
        } catch (error) {
            console.error("Error fetching workspace context:", error);
        }

        set({ 
            activeWorkspace: parsedId, 
            companyId: parsedId, 
            role: newRole, 
            permissions: { canViewFinancials }
        });
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        role: state.role,
        companyId: state.companyId,
        employeeId: state.employeeId,
        activeWorkspace: state.activeWorkspace,
      }),
    }
  )
);