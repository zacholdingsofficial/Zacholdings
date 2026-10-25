import { useState, useMemo, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { Search, TrendingUp, Wallet, Building2, Plus, X, Receipt, CheckCircle2, FileText, ArrowDownLeft, ArrowUpRight, Users, Download, BarChart3, Calendar, Filter, Clock, Edit2, Trash2, PieChart, Activity, ExternalLink, ChevronDown, Briefcase } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useDataStore } from "../../store/dataStore";
import { supabase } from "../../supabase";

export default function FinancePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { role, activeWorkspace, companyId } = useAuthStore();
  const { projects, invoices, salaryPayments, expenses, companies, employees, customers, fetchAllData, setTargetProjectId, setTargetInvoiceId } = useDataStore();

  const isAdmin = role === 'admin';
  const isHead = role === 'head';
  
  const currentCompanyId = isAdmin ? (activeWorkspace || "") : companyId;
  const currentCompany = companies.find((c: any) => c.id?.toString() === currentCompanyId?.toString());
  
  const canViewFinance = isAdmin || (isHead && currentCompany?.allow_head_finance !== false);

  const today = new Date().toISOString().split('T')[0];

  const [activeTab, setActiveTab] = useState<"active_projects" | "completed_projects" | "expenses">("active_projects");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCompanyId, setFilterCompanyId] = useState<string>("all");
  const [expenseStatusFilter, setExpenseStatusFilter] = useState<string>("all");

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
  const [selectedProjectDetails, setSelectedProjectDetails] = useState<any>(null);
  
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [completingExpense, setCompletingExpense] = useState<any>(null);
  const [completionDate, setCompletionDate] = useState(today);

  const [reportConfig, setReportConfig] = useState({
    companyId: isAdmin && !activeWorkspace ? filterCompanyId : currentCompanyId?.toString() || "",
    datePreset: 'this_month',
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
  });

  const [expenseForm, setExpenseForm] = useState({
    company_id: currentCompanyId?.toString() || "", project_id: "", category: "Software & Tools", description: "", amount: 0, expense_date: today,
    status: "Completed", due_date: ""
  });

  const getFilteredData = (dataArray: any[]) => {
    let data = dataArray;
    if (isAdmin && !activeWorkspace) {
      if (filterCompanyId !== "all") data = data.filter(item => item.company_id?.toString() === filterCompanyId);
    } else {
      data = data.filter(item => item.company_id === currentCompanyId);
    }
    return data;
  };

  const globalInvoices = getFilteredData(invoices);
  const globalPayments = getFilteredData(salaryPayments);
  const globalExpenses = getFilteredData(expenses);
  const globalProjects = getFilteredData(projects);

  useLayoutEffect(() => {
    if (location.state?.openProject && globalProjects.length > 0) {
      const projToOpen = globalProjects.find(p => p.id === location.state.openProject);
      if (projToOpen) {
        setSelectedProjectDetails(projToOpen);
      }
      window.history.replaceState({}, document.title);
    }
  }, [location.state, globalProjects]);

  const totalMoneyIn = globalInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount_paid || 0), 0);
  const totalEmployeePayouts = globalPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  const totalOverhead = globalExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const netProfit = totalMoneyIn - totalEmployeePayouts - totalOverhead;

  const handleViewInvoice = (invoiceId: number) => {
    const currentProjectId = selectedProjectDetails?.id;
    setTargetInvoiceId(invoiceId);
    navigate('/invoices', { state: { showLoadingMask: true, returnTo: '/finance', keepOpen: currentProjectId } });
  };

  const handleViewProjectWorkspace = (projectId: number) => {
    setTargetProjectId(projectId);
    navigate('/projects', { state: { showLoadingMask: true, returnTo: '/finance', keepOpen: projectId } });
  };

  const handleOpenNewExpense = () => {
    setEditingExpenseId(null);
    setExpenseForm({ company_id: currentCompanyId?.toString() || "", project_id: "", category: "Software & Tools", description: "", amount: 0, expense_date: today, status: "Completed", due_date: "" });
    setIsExpenseModalOpen(true);
  };

  const handleEditExpense = (exp: any) => {
    setEditingExpenseId(exp.id);
    setExpenseForm({
      company_id: exp.company_id?.toString() || "",
      project_id: exp.project_id?.toString() || "",
      category: exp.category || "Other",
      description: exp.description || "",
      amount: exp.amount || 0,
      expense_date: exp.expense_date || today,
      status: exp.status || "Completed",
      due_date: exp.due_date || ""
    });
    setIsExpenseModalOpen(true);
  };

  const handleDeleteExpense = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this expense? This action cannot be undone.")) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
      await fetchAllData();
    } catch (error: any) { alert(error.message); } finally { setIsSaving(false); }
  };

  const handleSaveExpense = async () => {
    if (!expenseForm.company_id || expenseForm.amount <= 0 || !expenseForm.description) return alert("Fill required fields.");
    setIsSaving(true);
    try {
      const payload = {
        company_id: parseInt(expenseForm.company_id),
        project_id: expenseForm.project_id ? parseInt(expenseForm.project_id) : null,
        category: expenseForm.category, 
        description: expenseForm.description, 
        amount: expenseForm.amount, 
        expense_date: expenseForm.expense_date, 
        status: expenseForm.status, 
        due_date: expenseForm.due_date || null
      };

      if (editingExpenseId) {
        const { error } = await supabase.from('expenses').update(payload).eq('id', editingExpenseId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('expenses').insert([payload]);
        if (error) throw error;
      }
      
      await fetchAllData(); 
      setIsExpenseModalOpen(false);
      setEditingExpenseId(null);
    } catch (error: any) { alert(`Error saving expense: ${error.message}`); } finally { setIsSaving(false); }
  };

  const handleMarkCompleted = async () => {
    if (!completionDate) return alert("Completion date is required.");
    setIsSaving(true);
    try {
      const { error } = await supabase.from('expenses').update({
        status: 'Completed',
        expense_date: completionDate 
      }).eq('id', completingExpense.id);
      
      if (error) throw error;
      await fetchAllData();
      setCompletingExpense(null);
    } catch (error: any) { alert(error.message); } finally { setIsSaving(false); }
  };

  const visibleProjects = globalProjects.filter(p => p.name?.toLowerCase().includes(searchQuery.toLowerCase()));
  
  const activeProjects = visibleProjects.filter(p => p.status !== 'Completed');
  const completedProjects = visibleProjects.filter(p => p.status === 'Completed');
  
  let visibleExpenses = [...globalExpenses]
    .sort((a,b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime())
    .filter(e => e.description?.toLowerCase().includes(searchQuery.toLowerCase()) || e.category?.toLowerCase().includes(searchQuery.toLowerCase()));
    
  if (expenseStatusFilter !== 'all') {
    visibleExpenses = visibleExpenses.filter(e => e.status?.toLowerCase() === expenseStatusFilter.toLowerCase());
  }

  const getProjectClientInfo = (proj: any) => {
    if (proj.customer_id) return { name: customers.find(c => c.id === proj.customer_id)?.name || 'Unknown', type: 'External Client' };
    if (proj.internal_company_id) return { name: companies.find(c => c.id === proj.internal_company_id)?.name || 'Unknown', type: 'Internal Subsidiary Transfer' };
    return { name: 'Unassigned', type: 'No Client' };
  };

  const handleOpenReport = () => {
    setReportConfig({
      ...reportConfig,
      companyId: isAdmin && !activeWorkspace ? filterCompanyId : currentCompanyId?.toString() || ""
    });
    setIsReportModalOpen(true);
  };

  const handlePresetChange = (preset: string) => {
    const d = new Date();
    let start = '', end = '';
    
    if (preset === 'this_month') {
      start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
      end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
    } else if (preset === 'last_month') {
      start = new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().split('T')[0];
      end = new Date(d.getFullYear(), d.getMonth(), 0).toISOString().split('T')[0];
    } else if (preset === 'ytd') {
      start = new Date(d.getFullYear(), 0, 1).toISOString().split('T')[0];
      end = d.toISOString().split('T')[0];
    } else if (preset === 'all_time') {
      start = ''; end = '';
    }
    
    setReportConfig({ ...reportConfig, datePreset: preset, startDate: start, endDate: end });
  };

  const generateReportData = () => {
    let rInvoices = invoices;
    let rExpenses = expenses;
    let rPayments = salaryPayments;

    if (reportConfig.companyId !== 'all') {
      rInvoices = rInvoices.filter(i => i.company_id?.toString() === reportConfig.companyId);
      rExpenses = rExpenses.filter(e => e.company_id?.toString() === reportConfig.companyId);
      rPayments = rPayments.filter(p => p.company_id?.toString() === reportConfig.companyId);
    }

    if (reportConfig.startDate) {
      rInvoices = rInvoices.filter(i => new Date(i.issue_date) >= new Date(reportConfig.startDate));
      rExpenses = rExpenses.filter(e => new Date(e.expense_date) >= new Date(reportConfig.startDate));
      rPayments = rPayments.filter(p => new Date(p.payment_date) >= new Date(reportConfig.startDate));
    }
    if (reportConfig.endDate) {
      rInvoices = rInvoices.filter(i => new Date(i.issue_date) <= new Date(reportConfig.endDate));
      rExpenses = rExpenses.filter(e => new Date(e.expense_date) <= new Date(reportConfig.endDate));
      rPayments = rPayments.filter(p => new Date(p.payment_date) <= new Date(reportConfig.endDate));
    }

    const inc = rInvoices.reduce((acc, i) => acc + parseFloat(i.amount_paid || 0), 0);
    const expOverhead = rExpenses.reduce((acc, e) => acc + parseFloat(e.amount || 0), 0);
    const expPayroll = rPayments.reduce((acc, p) => acc + parseFloat(p.amount || 0), 0);
    const exp = expOverhead + expPayroll;
    const prof = inc - exp;
    const margin = inc > 0 ? ((prof / inc) * 100).toFixed(1) : '0.0';

    const incList = rInvoices.filter(i => parseFloat(i.amount_paid) > 0).map(i => ({
      date: i.issue_date,
      ref: i.invoice_number,
      client: customers.find(c => c.id === i.customer_id)?.name || companies.find(c => c.id === projects.find(p => p.id === i.project_id)?.internal_company_id)?.name || 'Unknown',
      amount: parseFloat(i.amount_paid || 0)
    })).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const expList = [
      ...rExpenses.map(e => ({
        date: e.expense_date,
        cat: e.category || 'Other',
        desc: e.description,
        amount: parseFloat(e.amount || 0)
      })),
      ...rPayments.map(p => ({
        date: p.payment_date,
        cat: 'Payroll',
        desc: `Salary/Payout to ${employees.find(emp => emp.id === p.employee_id)?.name || 'Employee'}`,
        amount: parseFloat(p.amount || 0)
      }))
    ].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const categoryData: Record<string, number> = { 'Payroll': expPayroll };
    rExpenses.forEach(e => {
      const cat = e.category || 'Other';
      categoryData[cat] = (categoryData[cat] || 0) + parseFloat(e.amount || 0);
    });
    
    const sortedCategories = Object.keys(categoryData)
      .map(k => ({ category: k, amount: categoryData[k] }))
      .filter(item => item.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    const monthlyData: Record<string, { inc: number, exp: number }> = {};
    rInvoices.forEach(i => {
      const m = i.issue_date ? i.issue_date.substring(0, 7) : 'Unknown';
      if(!monthlyData[m]) monthlyData[m] = { inc: 0, exp: 0 };
      monthlyData[m].inc += parseFloat(i.amount_paid || 0);
    });
    rExpenses.forEach(e => {
      const m = e.expense_date ? e.expense_date.substring(0, 7) : 'Unknown';
      if(!monthlyData[m]) monthlyData[m] = { inc: 0, exp: 0 };
      monthlyData[m].exp += parseFloat(e.amount || 0);
    });
    rPayments.forEach(p => {
      const m = p.payment_date ? p.payment_date.substring(0, 7) : 'Unknown';
      if(!monthlyData[m]) monthlyData[m] = { inc: 0, exp: 0 };
      monthlyData[m].exp += parseFloat(p.amount || 0);
    });

    const chartData = Object.keys(monthlyData).sort().map(key => ({
      month: new Date(key + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      ...monthlyData[key]
    }));

    const maxChartVal = Math.max(...chartData.map(d => Math.max(d.inc, d.exp)), 1);

    return { inc, exp, prof, margin, chartData, maxChartVal, sortedCategories, incList, expList };
  };

  const reportStats = useMemo(() => generateReportData(), [reportConfig, isReportModalOpen]);

  const masterAdmin = employees.find(e => e.access_level === 'admin');
  const parentCompanyDef = companies.find(c => c.business_type === 'parent');
  
  const parentLogoUrl = parentCompanyDef?.logo_url || masterAdmin?.profile_image_url;
  const parentName = parentCompanyDef?.name || 'Zac Holdings';
  
  const selectedCompany = reportConfig.companyId !== 'all' ? companies.find(c => c.id.toString() === reportConfig.companyId) : null;
  const showSubjectEntity = selectedCompany && selectedCompany.name !== parentName;

  const lineChartIncPoints = reportStats.chartData.map((d, i) => {
    const x = reportStats.chartData.length > 1 ? (i / (reportStats.chartData.length - 1)) * 100 : 50;
    const y = 100 - (d.inc / (reportStats.maxChartVal || 1)) * 100;
    return `${x},${y}`;
  }).join(' ');

  const lineChartExpPoints = reportStats.chartData.map((d, i) => {
    const x = reportStats.chartData.length > 1 ? (i / (reportStats.chartData.length - 1)) * 100 : 50;
    const y = 100 - (d.exp / (reportStats.maxChartVal || 1)) * 100;
    return `${x},${y}`;
  }).join(' ');

  const renderProjectCard = (project: any) => {
    const pInvoices = globalInvoices.filter(i => i.project_id === project.id);
    const pPayments = globalPayments.filter(p => p.project_id === project.id);
    const pExpenses = globalExpenses.filter(e => e.project_id === project.id);

    const pMoneyIn = pInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount_paid || 0), 0);
    const pMoneyOut = pPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0) + pExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
    const pProfit = pMoneyIn - pMoneyOut;
    const clientInfo = getProjectClientInfo(project);

    return (
      <div key={project.id} onClick={() => setSelectedProjectDetails(project)} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-gray-300 transition-all group cursor-pointer">
         <div className="flex justify-between items-start mb-4 border-b border-gray-100 pb-3">
           <div className="min-w-0 pr-2">
             <div className="flex items-center gap-1.5 mb-1 print:hidden">
                <div className={`h-1.5 w-1.5 rounded-full ${project.status === 'Completed' ? 'bg-gray-400' : 'bg-green-500'}`}></div>
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">{project.status}</span>
             </div>
             <h3 className="text-[15px] font-bold text-gray-900 group-hover:text-blue-600 truncate transition-colors">{project.name}</h3>
             <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mt-1.5 truncate">
               {companies.find(c => c.id === project.company_id)?.name} • {clientInfo.name}
             </p>
           </div>
           {canViewFinance && (
             <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest shrink-0 ${pProfit >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
               {pProfit >= 0 ? 'Profit' : 'Deficit'}
             </span>
           )}
         </div>

         <div className="flex justify-between items-center gap-2">
            {canViewFinance && (
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1 truncate">Income</p>
                <p className="text-sm sm:text-base font-bold text-gray-900 truncate">₹{pMoneyIn.toLocaleString()}</p>
              </div>
            )}
            <div className={`flex-1 min-w-0 ${canViewFinance ? 'border-l border-gray-200 pl-4' : ''}`}>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1 truncate">Expenses</p>
              <p className="text-sm sm:text-base font-bold text-gray-900 truncate">₹{pMoneyOut.toLocaleString()}</p>
            </div>
            {canViewFinance && (
              <div className={`flex-1 min-w-0 border-l border-gray-200 pl-4 ${pProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-1 opacity-80 truncate">Profit</p>
                <p className="text-sm sm:text-base font-bold truncate">₹{pProfit.toLocaleString()}</p>
              </div>
            )}
         </div>
      </div>
    );
  };

  return (
    <>
      <div className="max-w-[1200px] mx-auto space-y-8 animate-in fade-in duration-700 pb-12 relative z-0 print:hidden">
        
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Finance Workspace</h1>
            <p className="text-sm font-medium text-gray-500 mt-1">Track comprehensive project income, team payroll, and operational expenses.</p>
          </div>
          
          <div className="flex items-center gap-3 shrink-0">
            {canViewFinance && (
              <button onClick={handleOpenReport} className="h-10 bg-gray-900 hover:bg-gray-800 text-white px-5 rounded-lg text-sm font-medium flex items-center shadow-sm transition-all">
                <BarChart3 className="h-4 w-4 mr-2" /> Financial Report
              </button>
            )}
            {isAdmin && !activeWorkspace && (
              <select
                value={filterCompanyId}
                onChange={(e) => setFilterCompanyId(e.target.value)}
                className="w-full sm:w-64 h-10 rounded-lg bg-white border border-gray-200 px-3 text-sm font-medium text-gray-700 outline-none cursor-pointer hover:bg-gray-50 transition-colors shadow-sm appearance-none"
                style={{ backgroundImage: `url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '14px' }}
              >
                <option value="all">Global (All Subsidiaries)</option>
                {companies.map(c => <option key={c.id} value={c.id.toString()}>{c.name}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className={`grid gap-4 ${canViewFinance ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {canViewFinance && (
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
               <div className="h-10 w-10 bg-green-50 rounded-lg flex items-center justify-center mb-4"><TrendingUp className="h-5 w-5 text-green-600" /></div>
               <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1 truncate">Total Income</p>
               <p className="text-2xl font-bold text-gray-900 truncate">₹{totalMoneyIn.toLocaleString()}</p>
            </div>
          )}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
             <div className="h-10 w-10 bg-blue-50 rounded-lg flex items-center justify-center mb-4"><Wallet className="h-5 w-5 text-blue-600" /></div>
             <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1 truncate">Total Payroll</p>
             <p className="text-2xl font-bold text-gray-900 truncate">₹{totalEmployeePayouts.toLocaleString()}</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
             <div className="h-10 w-10 bg-gray-100 rounded-lg flex items-center justify-center mb-4"><Receipt className="h-5 w-5 text-gray-600" /></div>
             <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1 truncate">Operational Expenses</p>
             <p className="text-2xl font-bold text-gray-900 truncate">₹{totalOverhead.toLocaleString()}</p>
          </div>
          {canViewFinance && (
            <div className={`p-5 rounded-xl border shadow-sm flex flex-col justify-between ${netProfit >= 0 ? 'bg-gray-900 border-gray-800' : 'bg-red-50 border-red-200'}`}>
               <div className={`h-10 w-10 rounded-lg flex items-center justify-center mb-4 ${netProfit >= 0 ? 'bg-white/10' : 'bg-red-100'}`}><Building2 className={`h-5 w-5 ${netProfit >= 0 ? 'text-white' : 'text-red-600'}`} /></div>
               <p className={`text-[10px] font-semibold uppercase tracking-widest mb-1 truncate ${netProfit >= 0 ? 'text-gray-300' : 'text-red-600'}`}>Net Profit</p>
               <p className={`text-2xl font-bold truncate ${netProfit >= 0 ? 'text-white' : 'text-red-700'}`}>₹{netProfit.toLocaleString()}</p>
            </div>
          )}
        </div>

        <div className="flex gap-6 border-b border-gray-200 overflow-x-auto max-sm:[&::-webkit-scrollbar]:hidden">
           <button onClick={() => setActiveTab('active_projects')} className={`pb-3 text-sm font-semibold transition-all border-b-2 whitespace-nowrap ${activeTab === 'active_projects' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>Active Projects</button>
           <button onClick={() => setActiveTab('completed_projects')} className={`pb-3 text-sm font-semibold transition-all border-b-2 whitespace-nowrap ${activeTab === 'completed_projects' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>Completed Projects</button>
           <button onClick={() => setActiveTab('expenses')} className={`pb-3 text-sm font-semibold transition-all border-b-2 whitespace-nowrap ${activeTab === 'expenses' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>Operational Expenses</button>
        </div>

        <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input type="text" placeholder={activeTab === 'expenses' ? "Search expenses by description or category..." : "Search projects..."} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full h-10 pl-10 pr-4 rounded-md border-none text-sm font-medium outline-none bg-transparent focus:ring-0 placeholder:text-gray-400" />
          </div>
        </div>

        {activeTab === 'active_projects' && (
          <div className="space-y-6">
            {activeProjects.length === 0 ? (
               <div className="h-40 border border-gray-200 border-dashed rounded-xl flex items-center justify-center text-gray-500 bg-gray-50"><p className="text-xs font-semibold uppercase tracking-widest">No Active Projects Found</p></div>
            ) : (
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 {activeProjects.map(project => renderProjectCard(project))}
               </div>
            )}
          </div>
        )}

        {activeTab === 'completed_projects' && (
          <div className="space-y-6">
            {completedProjects.length === 0 ? (
               <div className="h-40 border border-gray-200 border-dashed rounded-xl flex items-center justify-center text-gray-500 bg-gray-50"><p className="text-xs font-semibold uppercase tracking-widest">No Completed Projects Found</p></div>
            ) : (
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 {completedProjects.map(project => renderProjectCard(project))}
               </div>
            )}
          </div>
        )}

        {activeTab === 'expenses' && (
          <div className="space-y-6">
             <div className="flex flex-col sm:flex-row justify-between gap-4">
               <div className="flex items-center gap-3">
                 <Filter className="h-4 w-4 text-gray-400" />
                 <select value={expenseStatusFilter} onChange={(e) => setExpenseStatusFilter(e.target.value)} className="h-10 border border-gray-200 rounded-md px-3 text-sm font-medium text-gray-700 outline-none focus:border-blue-500">
                   <option value="all">All Statuses</option>
                   <option value="completed">Completed</option>
                   <option value="pending">Pending</option>
                   <option value="due">Due</option>
                 </select>
               </div>
               <button onClick={handleOpenNewExpense} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm px-5 py-2.5 rounded-md text-sm font-medium flex items-center justify-center transition-colors">
                 <Plus className="h-4 w-4 mr-2" /> Add Expense
               </button>
             </div>
             
             <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
               <div className="overflow-x-auto max-sm:[&::-webkit-scrollbar]:hidden">
                 <table className="w-full text-left text-sm min-w-[600px]">
                   <thead className="bg-gray-50 border-b border-gray-200">
                     <tr>
                       <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs whitespace-nowrap">Date & Details</th>
                       <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs whitespace-nowrap">Category / Project</th>
                       <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs whitespace-nowrap">Status & Due</th>
                       <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs text-right whitespace-nowrap">Amount</th>
                       <th className="px-6 py-4 font-semibold text-gray-500 uppercase tracking-wider text-xs text-right whitespace-nowrap">Actions</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-100">
                     {visibleExpenses.length === 0 ? (
                       <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-500 italic">No expenses match your filters.</td></tr>
                     ) : visibleExpenses.map(exp => (
                       <tr key={exp.id} className="hover:bg-gray-50 transition-colors group">
                          <td className="px-6 py-4">
                            <p className="font-bold text-gray-900 truncate max-w-[200px]">{exp.description}</p>
                            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mt-1">{exp.expense_date ? new Date(exp.expense_date).toLocaleDateString() : ''}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className="bg-gray-100 border border-gray-200 text-gray-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider block w-max mb-1.5">{exp.category}</span>
                            <span className="text-xs text-gray-500 font-medium">{exp.project_id ? projects.find(p=>p.id===exp.project_id)?.name : 'General Overhead'}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider 
                                ${exp.status?.toLowerCase() === 'completed' ? 'bg-green-100 text-green-800' 
                                  : exp.status?.toLowerCase() === 'due' ? 'bg-red-100 text-red-800' 
                                  : 'bg-amber-100 text-amber-800'}`}>
                                {exp.status || 'Completed'}
                              </span>
                              {exp.status?.toLowerCase() !== 'completed' && (
                                <button onClick={() => { setCompletingExpense(exp); setCompletionDate(today); }} className="text-[10px] bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-2.5 py-1 rounded font-bold transition-colors shadow-sm">
                                  Mark Paid
                                </button>
                              )}
                            </div>
                            {exp.due_date && <p className="text-[10px] font-semibold text-gray-500 mt-2 flex items-center gap-1.5"><Clock className="h-3 w-3"/> Due: {new Date(exp.due_date).toLocaleDateString()}</p>}
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-gray-900 text-base">
                            ₹{parseFloat(exp.amount || 0).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                               <button onClick={() => handleEditExpense(exp)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded-md transition-colors"><Edit2 className="h-4 w-4" /></button>
                               <button onClick={() => handleDeleteExpense(exp.id)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded-md transition-colors"><Trash2 className="h-4 w-4" /></button>
                            </div>
                          </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             </div>
          </div>
        )}
      </div>

      {/* PORTALS FOR MODALS */}

      {/* EXPENSE ADD/EDIT MODAL */}
      {createPortal(
        <AnimatePresence>
          {isExpenseModalOpen && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm print:hidden">
              <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }} className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden border border-gray-200">
                <div className="px-6 py-5 border-b border-gray-200 bg-white flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900">{editingExpenseId ? 'Edit Expense' : 'Add New Expense'}</h3>
                  <button onClick={() => setIsExpenseModalOpen(false)} className="h-8 w-8 bg-white border border-gray-200 rounded flex items-center justify-center text-gray-500 hover:text-gray-900 shadow-sm"><X className="h-4 w-4" /></button>
                </div>
                <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
                  {isAdmin && !activeWorkspace && (
                    <div>
                      <label className="text-sm font-semibold text-gray-700 block mb-1.5">Company</label>
                      <select value={expenseForm.company_id} onChange={e => setExpenseForm({...expenseForm, company_id: e.target.value})} className="w-full h-10 rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 outline-none">
                        <option value="" disabled>Select Company...</option>
                        {companies.map(c => <option key={c.id} value={c.id.toString()}>{c.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-1.5">Project (Optional)</label>
                    <select value={expenseForm.project_id} onChange={e => setExpenseForm({...expenseForm, project_id: e.target.value})} className="w-full h-10 rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 outline-none">
                      <option value="">General / Overhead</option>
                      {projects.filter(p => !expenseForm.company_id || p.company_id?.toString() === expenseForm.company_id).map(p => (
                        <option key={p.id} value={p.id.toString()}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-1.5">Category</label>
                    <select value={expenseForm.category} onChange={e => setExpenseForm({...expenseForm, category: e.target.value})} className="w-full h-10 rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 outline-none">
                      <option value="Software & Tools">Software & Tools</option>
                      <option value="Marketing & Ads">Marketing & Ads</option>
                      <option value="Office & Rent">Office & Rent</option>
                      <option value="Travel & Logistics">Travel & Logistics</option>
                      <option value="Hardware & Equipment">Hardware & Equipment</option>
                      <option value="Consulting/External">Consulting/External</option>
                      <option value="Other">Other Expenses</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-1.5">Description *</label>
                    <input type="text" value={expenseForm.description} onChange={e => setExpenseForm({...expenseForm, description: e.target.value})} placeholder="What was this expense for?" className="w-full h-10 rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-1.5">Amount (₹) *</label>
                    <div className="relative">
                       <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm">₹</span>
                       <input type="number" value={expenseForm.amount || ''} onChange={e => setExpenseForm({...expenseForm, amount: parseFloat(e.target.value) || 0})} className="w-full h-10 rounded-md border border-gray-300 pl-7 pr-3 text-sm focus:border-blue-500 outline-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold text-gray-700 block mb-1.5">Status</label>
                      <select value={expenseForm.status} onChange={e => setExpenseForm({...expenseForm, status: e.target.value})} className="w-full h-10 rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 outline-none">
                        <option value="Completed">Completed</option>
                        <option value="Pending">Pending</option>
                        <option value="Due">Due</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-700 block mb-1.5">Date / Due Date</label>
                      <input type="date" value={expenseForm.status === 'Completed' ? expenseForm.expense_date : expenseForm.due_date} onChange={e => {
                        if (expenseForm.status === 'Completed') {
                          setExpenseForm({...expenseForm, expense_date: e.target.value, due_date: ""});
                        } else {
                          setExpenseForm({...expenseForm, due_date: e.target.value});
                        }
                      }} className="w-full h-10 rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 outline-none" />
                    </div>
                  </div>
                </div>
                <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end gap-3 shrink-0">
                  <button onClick={() => setIsExpenseModalOpen(false)} className="rounded-md border border-gray-300 bg-white h-10 px-5 font-semibold text-sm text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">Cancel</button>
                  <button onClick={handleSaveExpense} disabled={isSaving} className="bg-blue-600 text-white rounded-md h-10 px-6 font-semibold text-sm shadow-sm hover:bg-blue-700 transition-all disabled:opacity-50">{isSaving ? "Saving..." : "Save Expense"}</button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>, 
        document.body
      )}

      {/* MARK AS PAID MODAL */}
      {createPortal(
        <AnimatePresence>
          {completingExpense && (
            <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm print:hidden">
              <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }} className="bg-white rounded-xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden border border-gray-200">
                <div className="px-6 py-5 border-b border-gray-200 bg-white flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900">Mark as Paid</h3>
                  <button onClick={() => setCompletingExpense(null)} className="h-8 w-8 bg-white border border-gray-200 rounded flex items-center justify-center text-gray-500 hover:text-gray-900 shadow-sm"><X className="h-4 w-4" /></button>
                </div>
                <div className="p-6 space-y-5">
                   <p className="text-sm text-gray-600">Please provide the exact date this expense was cleared.</p>
                   <div>
                     <label className="text-sm font-semibold text-gray-700 block mb-1.5">Completion Date *</label>
                     <input type="date" value={completionDate} onChange={e => setCompletionDate(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-blue-500" />
                   </div>
                </div>
                <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end gap-3 shrink-0">
                   <button onClick={() => setCompletingExpense(null)} className="rounded-md border border-gray-300 bg-white h-10 px-5 font-semibold text-sm text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">Cancel</button>
                   <button onClick={handleMarkCompleted} disabled={isSaving || !completionDate} className="bg-blue-600 text-white rounded-md h-10 px-6 font-semibold text-sm shadow-sm hover:bg-blue-700 transition-all disabled:opacity-50">{isSaving ? "Saving..." : "Confirm"}</button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* PROJECT DETAILS FINANCIAL MODAL */}
      {createPortal(
        <AnimatePresence>
          {selectedProjectDetails && (
            <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center sm:p-4 bg-gray-900/50 backdrop-blur-sm print:hidden">
              <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }} className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200">
                <div className="px-8 py-6 border-b border-gray-200 bg-white shrink-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">Financial Details</span>
                      <h3 className="text-2xl font-bold text-gray-900 mt-2 truncate">{selectedProjectDetails.name}</h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => handleViewProjectWorkspace(selectedProjectDetails.id)} className="h-10 px-4 bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-md flex items-center justify-center text-xs font-bold uppercase tracking-wider shadow-sm transition-colors print:hidden">
                          Workspace <ExternalLink className="h-4 w-4 ml-2" />
                      </button>
                      <button onClick={() => setSelectedProjectDetails(null)} className="h-10 w-10 bg-white border border-gray-300 rounded-md flex items-center justify-center text-gray-500 hover:text-gray-900 shadow-sm"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 bg-gray-50 space-y-8">
                  {(() => {
                    const pInvoices = globalInvoices.filter(i => i.project_id === selectedProjectDetails.id);
                    const pPayments = globalPayments.filter(p => p.project_id === selectedProjectDetails.id);
                    const pExpenses = globalExpenses.filter(e => e.project_id === selectedProjectDetails.id);

                    const pExpected = parseFloat(selectedProjectDetails.expected_amount || 0);
                    const pMoneyIn = pInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount_paid || 0), 0);
                    const pPayroll = pPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
                    const pOpEx = pExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
                    const pTotalOut = pPayroll + pOpEx;
                    
                    const pProfit = pMoneyIn - pTotalOut;
                    const pGrossMargin = pExpected - pTotalOut;
                    const pMarginPercent = pExpected > 0 ? Math.round((pGrossMargin / pExpected) * 100) : 0;

                    return (
                      <>
                        {canViewFinance ? (
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                             <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col justify-center print:break-inside-avoid">
                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Project Expected Value</h4>
                                <p className="text-4xl font-bold text-gray-900 tracking-tight">₹{pExpected.toLocaleString()}</p>
                             </div>
                             
                             <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-6 shadow-sm print:break-inside-avoid">
                                <div className="flex justify-between items-end mb-5">
                                  <div>
                                     <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Profit Margin & Projected Burn</h4>
                                     <div className="flex items-center gap-4 mt-2">
                                       <span className={`text-3xl font-bold ${pGrossMargin < 0 ? 'text-red-600' : 'text-green-600'}`}>₹{pGrossMargin.toLocaleString()}</span>
                                       <span className={`px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider border ${pGrossMargin < 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>{pMarginPercent}% Margin</span>
                                     </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Total Costs (Team + OpEx)</p>
                                    <p className="text-xl font-bold text-gray-900">₹{pTotalOut.toLocaleString()}</p>
                                  </div>
                                </div>
                                
                                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex border border-gray-200">
                                  <div className="h-full bg-blue-600 transition-all" style={{ width: `${pExpected > 0 ? Math.min((pPayroll / pExpected) * 100, 100) : 0}%`, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} title="Team Allocations"></div>
                                  <div className="h-full bg-gray-500 transition-all" style={{ width: `${pExpected > 0 ? Math.min((pOpEx / pExpected) * 100, 100) : 0}%`, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} title="Operational Expenses"></div>
                                </div>
                                <div className="flex gap-6 mt-4 text-[10px] font-bold uppercase tracking-widest text-gray-600">
                                  <div className="flex items-center gap-2"><div className="h-2.5 w-2.5 rounded-full bg-blue-600" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}></div> Team (₹{pPayroll.toLocaleString()})</div>
                                  <div className="flex items-center gap-2"><div className="h-2.5 w-2.5 rounded-full bg-gray-500" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}></div> OpEx (₹{pOpEx.toLocaleString()})</div>
                                </div>
                             </div>
                          </div>
                        ) : (
                          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm print:break-inside-avoid">
                             <div className="flex flex-col mb-5">
                               <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Total Project Costs (Team + OpEx)</h4>
                               <p className="text-3xl font-bold text-gray-900 mt-1">₹{pTotalOut.toLocaleString()}</p>
                             </div>
                             <div className="flex gap-6 mt-4 text-[10px] font-bold uppercase tracking-widest text-gray-600">
                               <div className="flex items-center gap-2"><div className="h-2.5 w-2.5 rounded-full bg-blue-600" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}></div> Team (₹{pPayroll.toLocaleString()})</div>
                               <div className="flex items-center gap-2"><div className="h-2.5 w-2.5 rounded-full bg-gray-500" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}></div> OpEx (₹{pOpEx.toLocaleString()})</div>
                             </div>
                          </div>
                        )}

                        <div className={`grid gap-6 ${canViewFinance ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1 lg:grid-cols-2'}`}>
                          {canViewFinance && (
                            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm print:break-inside-avoid">
                              <h4 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3 mb-4 flex items-center gap-2"><FileText className="h-4 w-4 text-blue-500" /> Invoices</h4>
                              {pInvoices.length === 0 ? <p className="text-sm italic text-gray-500">No invoices generated.</p> : (
                                <div className="space-y-3">
                                  {pInvoices.map(inv => (
                                    <div key={inv.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 group print:break-inside-avoid">
                                      <div className="flex justify-between items-center mb-2">
                                        <p className="font-bold text-gray-900 text-sm">{inv.invoice_number}</p>
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest ${inv.status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`} style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>{inv.status}</span>
                                      </div>
                                      <div className="flex justify-between items-end mt-3">
                                        <div>
                                          <div className="text-xs font-semibold text-gray-500 mb-1">Total: ₹{parseFloat(inv.total_amount || 0).toLocaleString()}</div>
                                          <div className="text-sm font-bold text-green-600">Paid: ₹{parseFloat(inv.amount_paid || 0).toLocaleString()}</div>
                                        </div>
                                        <button onClick={() => handleViewInvoice(inv.id)} className="text-xs font-bold text-blue-600 hover:text-blue-700 uppercase tracking-wider flex items-center gap-1 bg-white border border-blue-200 px-3 py-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity shadow-sm print:hidden">
                                          View <ExternalLink className="h-3 w-3" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm print:break-inside-avoid">
                            <h4 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3 mb-4 flex items-center gap-2"><Users className="h-4 w-4 text-blue-500" /> Project Payroll</h4>
                            {pPayments.length === 0 ? <p className="text-sm italic text-gray-500">No employee payments recorded.</p> : (
                              <div className="space-y-3">
                                {pPayments.map(p => {
                                  const emp = employees.find(e => e.id === p.employee_id);
                                  return (
                                    <div key={p.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex justify-between items-center print:break-inside-avoid">
                                      <div>
                                        <p className="text-sm font-bold text-gray-900">{emp?.name || 'Unknown'}</p>
                                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mt-1">{p.payment_date ? new Date(p.payment_date).toLocaleDateString() : ''}</p>
                                      </div>
                                      <p className="text-base font-bold text-gray-700">₹{parseFloat(p.amount || 0).toLocaleString()}</p>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm print:break-inside-avoid">
                            <h4 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3 mb-4 flex items-center gap-2"><Briefcase className="h-4 w-4 text-blue-500" /> OpEx (Expenses)</h4>
                            {pExpenses.length === 0 ? <p className="text-sm italic text-gray-500">No operational expenses logged.</p> : (
                              <div className="space-y-3">
                                {pExpenses.map(e => (
                                  <div key={e.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex justify-between items-center print:break-inside-avoid">
                                    <div className="flex-1 min-w-0 pr-4">
                                      <p className="text-sm font-bold text-gray-900 truncate">{e.description}</p>
                                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mt-1 truncate">{e.expense_date ? new Date(e.expense_date).toLocaleDateString() : ''} • {e.category}</p>
                                    </div>
                                    <p className="text-base font-bold text-gray-700 shrink-0">₹{parseFloat(e.amount || 0).toLocaleString()}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {createPortal(
        <AnimatePresence>
          {isReportModalOpen && (
            <div className="fixed inset-0 z-[10000] flex flex-col bg-gray-900/50 backdrop-blur-sm overflow-y-auto sm:p-4 print:static print:inset-auto print:p-0 print:bg-white print:block print:h-auto print:overflow-visible">
              <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }} className="bg-white min-h-full sm:min-h-[90vh] w-full max-w-5xl mx-auto sm:rounded-xl border border-gray-200 shadow-2xl flex flex-col relative print:shadow-none print:m-0 print:min-h-0 print:h-auto print:w-full print:rounded-none print:border-none print:block print:overflow-visible print:static">
                <div className="bg-white border-b border-gray-200 p-6 flex flex-col gap-5 shrink-0 print:hidden relative">
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                         <div className="h-10 w-10 bg-blue-50 rounded-lg flex items-center justify-center border border-blue-100">
                           <BarChart3 className="h-5 w-5 text-blue-600" />
                         </div>
                         <h2 className="text-2xl font-bold tracking-tight text-gray-900">Financial Report</h2>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                         <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white h-10 px-5 rounded-md text-sm font-semibold transition-colors shadow-sm flex items-center">
                           <Download className="h-4 w-4 sm:mr-2"/> <span className="hidden sm:inline">Save PDF</span>
                         </button>
                         <button onClick={() => setIsReportModalOpen(false)} className="h-10 w-10 bg-white hover:bg-gray-50 text-gray-500 border border-gray-300 rounded-md flex items-center justify-center transition-colors shadow-sm">
                           <X className="h-5 w-5" />
                         </button>
                      </div>
                   </div>
                   <div className="flex flex-wrap items-center gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                      {isAdmin && !activeWorkspace ? (
                        <select value={reportConfig.companyId} onChange={e=>setReportConfig({...reportConfig, companyId: e.target.value})} className="bg-white border border-gray-300 text-gray-900 h-10 px-3 rounded-md text-sm font-medium outline-none cursor-pointer">
                          <option value="all">All Companies</option>
                          {companies.map(c=><option key={c.id} value={c.id.toString()}>{c.name}</option>)}
                        </select>
                      ) : (
                        <div className="bg-white border border-gray-300 text-gray-900 h-10 px-4 rounded-md text-sm font-medium flex items-center">
                          {companies.find(c => c.id.toString() === reportConfig.companyId)?.name || 'Your Subsidiary'}
                        </div>
                      )}
                      <select value={reportConfig.datePreset} onChange={(e) => handlePresetChange(e.target.value)} className="bg-white border border-gray-300 text-gray-900 h-10 px-3 rounded-md text-sm font-medium outline-none cursor-pointer">
                         <option value="custom">Custom Range</option>
                         <option value="this_month">This Month</option>
                         <option value="last_month">Last Month</option>
                         <option value="ytd">Year to Date</option>
                         <option value="all_time">All Time</option>
                      </select>
                      <div className="flex items-center gap-2 bg-white rounded-md px-3 h-10 border border-gray-300">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        <input type="date" value={reportConfig.startDate} onChange={e=>setReportConfig({...reportConfig, startDate: e.target.value, datePreset: 'custom'})} className="bg-transparent text-gray-900 text-sm font-medium outline-none w-[120px]" />
                        <span className="text-gray-400 font-bold">-</span>
                        <input type="date" value={reportConfig.endDate} onChange={e=>setReportConfig({...reportConfig, endDate: e.target.value, datePreset: 'custom'})} className="bg-transparent text-gray-900 text-sm font-medium outline-none w-[120px]" />
                      </div>
                   </div>
                </div>
                
                <div className="p-8 sm:p-12 flex-1 bg-white print:p-8 print:block print:h-auto print:overflow-visible" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                   <div className="flex justify-between items-start mb-10 border-b border-gray-200 pb-8 print:break-inside-avoid">
                      <div className="flex flex-col items-start w-1/3">
                         {parentLogoUrl ? (
                            <img src={parentLogoUrl} alt="Parent Logo" className="h-16 object-contain mb-3 print:h-12 mix-blend-multiply" />
                         ) : (
                            <div className="h-16 w-16 rounded-xl bg-gray-900 flex items-center justify-center text-white text-2xl font-bold mb-3 print:h-12 print:w-12" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                              {parentName.charAt(0)}
                            </div>
                         )}
                         <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{parentName}</p>
                         <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Parent Entity</p>
                      </div>
                      <div className="text-center w-1/3">
                        <h1 className="text-2xl font-bold text-gray-900 mb-2 uppercase tracking-tight print:text-xl">Financial Report</h1>
                        <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">
                          {reportConfig.companyId === 'all' ? 'Consolidated Overview' : selectedCompany?.name}
                        </p>
                        <p className="text-[11px] font-semibold text-gray-600 bg-gray-100 inline-block px-4 py-1.5 rounded-md border border-gray-200" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                          {reportConfig.startDate ? new Date(reportConfig.startDate).toLocaleDateString() : 'Beginning'} — {reportConfig.endDate ? new Date(reportConfig.endDate).toLocaleDateString() : 'Present'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end text-right w-1/3">
                         {showSubjectEntity && selectedCompany && (
                            <>
                               {selectedCompany.logo_url ? (
                                  <img src={selectedCompany.logo_url} alt="Sub Logo" className="h-16 object-contain mb-3 print:h-12 mix-blend-multiply" />
                               ) : (
                                  <div className="h-16 w-16 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-500 text-2xl font-bold mb-3 print:h-12 print:w-12" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                                    {selectedCompany.name.charAt(0)}
                                  </div>
                               )}
                               <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{selectedCompany.name}</p>
                               <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Subject Entity</p>
                            </>
                         )}
                      </div>
                   </div>
                   
                   <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 print:grid-cols-4 print:gap-4 print:mb-8 print:break-inside-avoid">
                     <div className="border-l-4 border-green-500 bg-gray-50 p-5 rounded-r-xl border-y border-r border-gray-200 print:p-4" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                       <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1.5 whitespace-nowrap"><ArrowDownLeft className="h-3.5 w-3.5 text-green-600" /> Income</p>
                       <p className="text-2xl font-bold text-gray-900 break-words print:text-xl">₹{reportStats.inc.toLocaleString()}</p>
                     </div>
                     <div className="border-l-4 border-red-500 bg-gray-50 p-5 rounded-r-xl border-y border-r border-gray-200 print:p-4" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                       <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1.5 whitespace-nowrap"><ArrowUpRight className="h-3.5 w-3.5 text-red-600" /> Expenses</p>
                       <p className="text-2xl font-bold text-gray-900 break-words print:text-xl">₹{reportStats.exp.toLocaleString()}</p>
                     </div>
                     <div className={`border-l-4 p-5 rounded-r-xl border-y border-r print:p-4 ${reportStats.prof >= 0 ? 'border-blue-500 bg-blue-50 border-y-blue-100 border-r-blue-100' : 'border-red-500 bg-red-50 border-y-red-100 border-r-red-100'}`} style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                       <p className={`text-[11px] font-bold uppercase tracking-widest mb-1 whitespace-nowrap ${reportStats.prof >= 0 ? 'text-blue-700' : 'text-red-700'}`}>Net Profit</p>
                       <p className={`text-2xl font-bold break-words print:text-xl ${reportStats.prof >= 0 ? 'text-blue-900' : 'text-red-900'}`}>₹{reportStats.prof.toLocaleString()}</p>
                     </div>
                     <div className="border-l-4 border-gray-400 bg-gray-50 p-5 rounded-r-xl border-y border-r border-gray-200 print:p-4" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                       <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1 whitespace-nowrap">Margin</p>
                       <p className="text-2xl font-bold text-gray-900 break-words print:text-xl">{reportStats.margin}%</p>
                     </div>
                   </div>
                   
                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 print:grid print:grid-cols-2 print:gap-6 print:mb-8 print:break-inside-avoid">
                      <div className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm flex flex-col print:p-5 print:shadow-none print:border-gray-300 print:break-inside-avoid">
                         <h3 className="text-sm font-bold text-gray-900 mb-6 flex items-center print:text-xs"><BarChart3 className="h-4 w-4 mr-2 text-blue-600 print:h-3 print:w-3"/> Monthly Cash Flow</h3>
                         <div className="flex-1 min-h-[200px] flex items-end gap-2 sm:gap-4 border-b border-gray-200 print:min-h-[160px] pb-2">
                           {reportStats.chartData.length === 0 ? <p className="w-full flex items-center justify-center text-sm font-medium text-gray-400 italic mb-10">No monthly data available.</p> : null}
                           {reportStats.chartData.map((data, idx) => {
                             const incHeight = Math.max((data.inc / (reportStats.maxChartVal || 1)) * 100, 2);
                             const expHeight = Math.max((data.exp / (reportStats.maxChartVal || 1)) * 100, 2);
                             return (
                               <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full group shrink-0 relative">
                                 <div className="flex items-end justify-center w-full gap-1.5 h-full z-10">
                                   <div style={{ height: `${incHeight}%`, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} className="w-full max-w-[24px] bg-green-500 rounded-t-sm relative transition-all">
                                     <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-bold text-green-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap print:opacity-100 print:text-[7px]">₹{(data.inc/1000).toFixed(0)}k</span>
                                   </div>
                                   <div style={{ height: `${expHeight}%`, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} className="w-full max-w-[24px] bg-red-500 rounded-t-sm relative transition-all">
                                     <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-bold text-red-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap print:opacity-100 print:text-[7px]">₹{(data.exp/1000).toFixed(0)}k</span>
                                   </div>
                                 </div>
                                 <span className="text-[10px] font-bold text-gray-500 mt-3 truncate w-full text-center print:text-[8px]">{data.month}</span>
                               </div>
                             )
                           })}
                         </div>
                         <div className="flex justify-center gap-6 mt-8 text-[10px] font-bold uppercase tracking-widest text-gray-600 print:mt-6 print:text-[8px]">
                           <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-500 rounded-sm print:bg-green-500" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}></div> Income</div>
                           <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-500 rounded-sm print:bg-red-500" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}></div> Expense</div>
                         </div>
                      </div>
                      
                      <div className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm print:p-5 print:shadow-none print:border-gray-300 flex flex-col print:break-inside-avoid">
                         <h3 className="text-sm font-bold text-gray-900 mb-6 flex items-center print:text-xs"><Activity className="h-4 w-4 mr-2 text-blue-600 print:h-3 print:w-3"/> Cash Flow Trend</h3>
                         <div className="flex-1 flex flex-col justify-end w-full min-h-[200px] print:min-h-[160px]">
                            {reportStats.chartData.length === 0 ? (
                               <p className="flex-1 flex items-center justify-center text-sm font-medium text-gray-400 italic pb-10">No monthly data available.</p>
                            ) : (
                               <>
                                  <div className="relative w-full h-full flex-1 mb-2">
                                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full absolute inset-0 overflow-visible" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                                      <line x1="0" y1="25" x2="100" y2="25" stroke="#f1f5f9" strokeWidth="0.5" />
                                      <line x1="0" y1="50" x2="100" y2="50" stroke="#f1f5f9" strokeWidth="0.5" />
                                      <line x1="0" y1="75" x2="100" y2="75" stroke="#f1f5f9" strokeWidth="0.5" />
                                      <line x1="0" y1="100" x2="100" y2="100" stroke="#e2e8f0" strokeWidth="1" />
                                      {reportStats.chartData.length > 1 && (
                                         <>
                                           <polyline points={lineChartIncPoints} fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                           <polyline points={lineChartExpPoints} fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                         </>
                                      )}
                                      {reportStats.chartData.map((d, i) => {
                                         const x = reportStats.chartData.length > 1 ? (i / (reportStats.chartData.length - 1)) * 100 : 50;
                                         const incY = 100 - (d.inc / (reportStats.maxChartVal || 1)) * 100;
                                         const expY = 100 - (d.exp / (reportStats.maxChartVal || 1)) * 100;
                                         return (
                                           <g key={i}>
                                             <circle cx={x} cy={incY} r="2" fill="#22c55e" />
                                             <circle cx={x} cy={expY} r="2" fill="#ef4444" />
                                           </g>
                                         )
                                      })}
                                    </svg>
                                  </div>
                                  <div className="relative w-full h-4 mt-2">
                                    {reportStats.chartData.map((d, i) => {
                                      const leftPos = reportStats.chartData.length > 1 ? (i / (reportStats.chartData.length - 1)) * 100 : 50;
                                      return (
                                        <span key={i} className="text-[10px] font-bold text-gray-500 print:text-[8px] absolute whitespace-nowrap top-0" style={{ left: `${leftPos}%`, transform: 'translateX(-50%)' }}>
                                          {d.month}
                                        </span>
                                      )
                                    })}
                                  </div>
                               </>
                            )}
                         </div>
                         <div className="flex justify-center gap-6 mt-6 text-[10px] font-bold uppercase tracking-widest text-gray-600 print:mt-4 print:text-[8px]">
                           <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-500 rounded-sm print:bg-green-500" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}></div> Income Trend</div>
                           <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-500 rounded-sm print:bg-red-500" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}></div> Expense Trend</div>
                         </div>
                      </div>
                   </div>

                   <div className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm mb-12 print:p-5 print:shadow-none print:border-gray-300 print:break-inside-avoid print:mb-8">
                      <h3 className="text-sm font-bold text-gray-900 mb-6 flex items-center print:text-xs"><PieChart className="h-4 w-4 mr-2 text-gray-500 print:h-3 print:w-3"/> Expense Distribution</h3>
                      <div className="space-y-5 print:space-y-4">
                         {reportStats.sortedCategories.length === 0 ? <p className="text-sm font-medium text-gray-400 italic">No expenses logged.</p> : null}
                         {reportStats.sortedCategories.map((item, idx) => {
                            const percentage = ((item.amount / reportStats.exp) * 100).toFixed(1);
                            return (
                              <div key={idx} className="print:break-inside-avoid">
                                 <div className="flex justify-between items-end mb-1.5 text-xs font-bold print:text-[10px]">
                                    <span className="text-gray-700">{item.category}</span>
                                    <span className="text-gray-900">₹{item.amount.toLocaleString()} <span className="text-gray-400 font-medium ml-1.5">({percentage}%)</span></span>
                                 </div>
                                 <div className="w-full bg-gray-100 rounded-full h-2 print:h-1.5" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                                    <div className="bg-gray-500 h-2 rounded-full print:h-1.5" style={{ width: `${percentage}%`, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}></div>
                                 </div>
                              </div>
                            )
                         })}
                      </div>
                   </div>

                   <div className="print:break-inside-avoid">
                      <h3 className="text-sm font-bold text-gray-900 border-b border-gray-200 pb-3 mb-5 print:text-xs bg-gray-50/50 print:bg-gray-50 px-3 pt-3 rounded-t-lg">Income Ledger</h3>
                      <table className="w-full text-left text-xs mb-12 print:text-[10px]">
                         <thead className="text-gray-500 uppercase tracking-widest text-[10px] print:text-[8px] border-b border-gray-200">
                            <tr>
                               <th className="pb-3 font-bold px-3">Date</th>
                               <th className="pb-3 font-bold px-3">Ref / Invoice No</th>
                               <th className="pb-3 font-bold px-3">Client / Entity</th>
                               <th className="pb-3 font-bold text-right px-3">Amount</th>
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-gray-100">
                            {reportStats.incList.length === 0 ? (
                               <tr><td colSpan={4} className="py-5 text-gray-500 italic text-center font-medium">No income recorded.</td></tr>
                            ) : (
                               reportStats.incList.map((inc, i) => (
                                  <tr key={i} className="print:break-inside-avoid">
                                     <td className="py-3 px-3 text-gray-600 font-medium">{inc.date ? new Date(inc.date).toLocaleDateString() : '-'}</td>
                                     <td className="py-3 px-3 font-bold text-gray-900">{inc.ref}</td>
                                     <td className="py-3 px-3 text-gray-700 font-medium">{inc.client}</td>
                                     <td className="py-3 px-3 font-bold text-green-600 text-right">₹{inc.amount.toLocaleString()}</td>
                                  </tr>
                               ))
                            )}
                         </tbody>
                      </table>
                   </div>

                   <div className="print:break-inside-avoid">
                      <h3 className="text-sm font-bold text-gray-900 border-b border-gray-200 pb-3 mb-5 print:text-xs bg-gray-50/50 print:bg-gray-50 px-3 pt-3 rounded-t-lg">Expense Ledger</h3>
                      <table className="w-full text-left text-xs print:text-[10px]">
                         <thead className="text-gray-500 uppercase tracking-widest text-[10px] print:text-[8px] border-b border-gray-200">
                            <tr>
                               <th className="pb-3 font-bold w-28 px-3">Date</th>
                               <th className="pb-3 font-bold w-40 px-3">Category</th>
                               <th className="pb-3 font-bold px-3">Description</th>
                               <th className="pb-3 font-bold text-right px-3">Amount</th>
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-gray-100">
                            {reportStats.expList.length === 0 ? (
                               <tr><td colSpan={4} className="py-5 text-gray-500 italic text-center font-medium">No expenses recorded.</td></tr>
                            ) : (
                               reportStats.expList.map((exp, i) => (
                                  <tr key={i} className="print:break-inside-avoid">
                                     <td className="py-3 px-3 text-gray-600 font-medium align-top">{exp.date ? new Date(exp.date).toLocaleDateString() : '-'}</td>
                                     <td className="py-3 px-3 align-top">
                                        <span className="bg-gray-100 text-gray-700 border border-gray-200 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                                           {exp.cat}
                                        </span>
                                     </td>
                                     <td className="py-3 px-3 text-gray-900 font-medium pr-4">{exp.desc}</td>
                                     <td className="py-3 px-3 font-bold text-red-600 text-right align-top">₹{exp.amount.toLocaleString()}</td>
                                  </tr>
                               ))
                            )}
                         </tbody>
                      </table>
                   </div>

                   <div className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-16 pt-8 border-t border-gray-200 print:mt-12 print:pt-6 print:text-[8px] print:break-inside-avoid">
                      End of Report • Generated on {new Date().toLocaleString()}
                   </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
