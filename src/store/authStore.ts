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
  
  checkSession: () => Promise<void>;
  // MODIFIED: signIn now accepts the explicitly selected role and company context
  signIn: (email: string, password: string, selectedRole?: 'admin' | 'head' | 'user' | null, selectedCompanyId?: number | null) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  setActiveWorkspace: (id: number | null) => void;
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

      checkSession: async () => {
        set({ isLoading: true });
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          const { data: emp } = await supabase.from('employees').select('access_level, company_id, id').eq('email', session.user.email).single();
          
          // MODIFIED: Fetch the currently persisted session context first
          const currentRole = get().role;
          const currentCompanyId = get().companyId;
          
          set({ 
            user: session.user, 
            employeeId: emp?.id || null, 
            // Fallback to primary DB profile ONLY if the persisted state is somehow missing
            role: currentRole || emp?.access_level || 'user', 
            companyId: currentCompanyId || emp?.company_id || null, 
            isLoading: false 
          }); 
        } else {
          set({ user: null, role: null, companyId: null, employeeId: null, activeWorkspace: null, isLoading: false });
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
        
        set({ 
          user: auth.user, 
          employeeId: emp?.id || null, 
          // MODIFIED: Inject the explicitly selected UI context, otherwise default to DB primary
          role: selectedRole || emp?.access_level || 'user', 
          companyId: selectedCompanyId || emp?.company_id || null, 
          activeWorkspace: selectedCompanyId || null,
          isLoading: false 
        });
        
        return { error: null };
      },

      signOut: async () => {
        await supabase.auth.signOut();
        set({ user: null, role: null, companyId: null, employeeId: null, activeWorkspace: null });
      },

      setActiveWorkspace: (id) => set({ activeWorkspace: id })
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