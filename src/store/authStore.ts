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
  setActiveWorkspace: (id: number | null) => Promise<void>;
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

          // MODIFIED: We set the base data but KEEP isLoading: true
          set({ 
            user: session.user, 
            employeeId: emp?.id || null, 
            role: currentRole || emp?.access_level || 'user', 
            companyId: currentCompanyId || emp?.company_id || null, 
            activeWorkspace: targetWorkspace
          }); 

          // Wait for the workspace permissions and specific role to be fully hydrated
          if (targetWorkspace) {
            await get().setActiveWorkspace(targetWorkspace);
          }
          
          // MODIFIED: NOW we stop the loading spinner, preventing the UI flash
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

        // MODIFIED: We set the base data but KEEP isLoading: true
        set({ 
          user: auth.user, 
          employeeId: emp?.id || null, 
          role: initialRole, 
          companyId: initialCompanyId, 
          activeWorkspace: initialCompanyId
        });

        // Wait for the workspace permissions and specific role to be fully hydrated
        if (initialCompanyId) {
            await get().setActiveWorkspace(initialCompanyId);
        }
        
        // MODIFIED: NOW we stop the loading spinner, preventing the UI flash
        set({ isLoading: false });
        return { error: null };
      },

      signOut: async () => {
        await supabase.auth.signOut();
        set({ user: null, role: null, companyId: null, employeeId: null, activeWorkspace: null, permissions: null });
      },

      setActiveWorkspace: async (id) => {
        if (!id) {
            set({ activeWorkspace: null, permissions: null });
            return;
        }

        const employeeId = get().employeeId;
        let newRole = get().role; 
        let canViewFinancials = true; 

        try {
            const { data: companyData } = await supabase
                .from('companies')
                .select('allow_head_finance') 
                .eq('id', id)
                .single();
            
            if (companyData && companyData.allow_head_finance === false) {
                canViewFinancials = false;
            }

            if (employeeId) {
                const { data: roleData } = await supabase
                    .from('employee_company_roles')
                    .select('access_level') 
                    .eq('employee_id', employeeId)
                    .eq('company_id', id)
                    .single();

                if (roleData && roleData.access_level) {
                    newRole = roleData.access_level;
                }
            }
        } catch (error) {
            console.error("Error fetching workspace context:", error);
        }

        set({ 
            activeWorkspace: id, 
            companyId: id, 
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