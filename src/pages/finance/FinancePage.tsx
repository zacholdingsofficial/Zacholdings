import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, TrendingUp, Wallet, Building2, Plus, X, Receipt, CheckCircle2, UserSquare2, FileText, ArrowDownLeft, ArrowUpRight, Users, Download, BarChart3, Calendar, Filter, Clock, Edit2, Trash2, PieChart, Activity } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useDataStore } from "../../store/dataStore";
import { supabase } from "../../supabase";

export default function FinancePage() {
  const { role, activeWorkspace, companyId } = useAuthStore();
  const { projects, invoices, salaryPayments, expenses, companies, employees, customers, fetchAllData } = useDataStore();

  const isAdmin = role === 'admin';
  const isHead = role === 'head';
  
  const currentCompanyId = isAdmin ? (activeWorkspace || "") : companyId;
  const currentCompany = companies.find((c: any) => c.id?.toString() === currentCompanyId?.toString());
  
  // --- DYNAMIC FINANCE ACCESS CHECK ---
  const canViewFinance = isAdmin || (isHead && currentCompany?.allow_head_finance !== false);

  const today = new Date().toISOString().split('T')[0];

  const [activeTab, setActiveTab] = useState<"projects" | "expenses">("projects");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCompanyId, setFilterCompanyId] = useState<string>("all");
  const [expenseStatusFilter, setExpenseStatusFilter] = useState<string>("all");

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
  const [selectedProjectDetails, setSelectedProjectDetails] = useState<any>(null);
  
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Completion Modal State
  const [completingExpense, setCompletingExpense] = useState<any>(null);
  const [completionDate, setCompletionDate] = useState(today);

  // Report Filters
  const [reportConfig, setReportConfig] = useState({
    companyId: isAdmin && !activeWorkspace ? filterCompanyId : currentCompanyId?.toString() || "",
    datePreset: 'this_month',
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
  });

  const [expenseForm, setExpenseForm] = useState({
    company_id: currentCompanyId?.toString() || "", project_id: "", category: "Software", description: "", amount: 0, expense_date: today,
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

  const totalMoneyIn = globalInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount_paid || 0), 0);
  const totalEmployeePayouts = globalPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  const totalOverhead = globalExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const netProfit = totalMoneyIn - totalEmployeePayouts - totalOverhead;

  // --- EXPENSE CRUD LOGIC ---

  const handleOpenNewExpense = () => {
    setEditingExpenseId(null);
    setExpenseForm({ company_id: currentCompanyId?.toString() || "", project_id: "", category: "Software", description: "", amount: 0, expense_date: today, status: "Completed", due_date: "" });
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

  // --- FILTERING ---
  const visibleProjects = globalProjects.filter(p => p.name?.toLowerCase().includes(searchQuery.toLowerCase()));
  
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

  // --- REPORT GENERATION LOGIC ---
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

    // Totals
    const inc = rInvoices.reduce((acc, i) => acc + parseFloat(i.amount_paid || 0), 0);
    const expOverhead = rExpenses.reduce((acc, e) => acc + parseFloat(e.amount || 0), 0);
    const expPayroll = rPayments.reduce((acc, p) => acc + parseFloat(p.amount || 0), 0);
    const exp = expOverhead + expPayroll;
    const prof = inc - exp;
    const margin = inc > 0 ? ((prof / inc) * 100).toFixed(1) : '0.0';

    // Detailed Ledgers
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

    // Category Grouping
    const categoryData: Record<string, number> = { 'Payroll': expPayroll };
    rExpenses.forEach(e => {
      const cat = e.category || 'Other';
      categoryData[cat] = (categoryData[cat] || 0) + parseFloat(e.amount || 0);
    });
    
    // Sort categories by highest expense
    const sortedCategories = Object.keys(categoryData)
      .map(k => ({ category: k, amount: categoryData[k] }))
      .filter(item => item.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    // Grouping by Month for Chart
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

  // Report Logos Data
  const parentCompany = companies.find(c => c.id === companyId); // Based on the admin's core ID
  const selectedCompany = reportConfig.companyId !== 'all' ? companies.find(c => c.id.toString() === reportConfig.companyId) : null;
  const showBothLogos = selectedCompany && selectedCompany.id !== parentCompany?.id;

  // Polyline Points for SVG Line Chart
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

  return (
    <>
      <div className="max-w-[1200px] mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-700 pb-8 relative z-0 print:hidden">
        
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-6">
          <div>
            <p className="text-[9px] sm:text-[11px] font-bold text-emerald-600 uppercase tracking-[0.2em] mb-1.5 bg-emerald-50 inline-block px-2.5 py-1 rounded-full">Overview</p>
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 mt-1">Finance.</h1>
          </div>
          
          <div className="flex items-center gap-3 shrink-0">
            {canViewFinance && (
              <button onClick={handleOpenReport} className="h-10 sm:h-12 bg-indigo-600 text-white px-4 sm:px-5 rounded-xl sm:rounded-2xl text-[12px] sm:text-sm font-bold flex items-center shadow-sm hover:shadow-md transition-all">
                <BarChart3 className="h-4 w-4 mr-2" /> Financial Report
              </button>
            )}
            {isAdmin && !activeWorkspace && (
              <select
                value={filterCompanyId}
                onChange={(e) => setFilterCompanyId(e.target.value)}
                className="w-full sm:w-64 h-10 sm:h-12 rounded-xl sm:rounded-2xl bg-white border border-slate-200 px-3 sm:px-4 text-[12px] sm:text-sm font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-50 transition-colors shadow-sm appearance-none"
              >
                <option value="all">All Companies</option>
                {companies.map(c => <option key={c.id} value={c.id.toString()}>{c.name}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* TOP CARDS */}
        <div className={`grid gap-3 sm:gap-4 ${canViewFinance ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {canViewFinance && (
            <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
               <div className="h-8 w-8 sm:h-10 sm:w-10 bg-emerald-50 rounded-lg flex items-center justify-center mb-3"><TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" /></div>
               <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 truncate">Total Income</p>
               <p className="text-lg sm:text-2xl font-black text-slate-900 truncate">₹{totalMoneyIn.toLocaleString()}</p>
            </div>
          )}
          <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
             <div className="h-8 w-8 sm:h-10 sm:w-10 bg-blue-50 rounded-lg flex items-center justify-center mb-3"><Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" /></div>
             <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 truncate">Total Payroll</p>
             <p className="text-lg sm:text-2xl font-black text-slate-900 truncate">₹{totalEmployeePayouts.toLocaleString()}</p>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
             <div className="h-8 w-8 sm:h-10 sm:w-10 bg-amber-50 rounded-lg flex items-center justify-center mb-3"><Receipt className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" /></div>
             <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 truncate">Other Expenses</p>
             <p className="text-lg sm:text-2xl font-black text-slate-900 truncate">₹{totalOverhead.toLocaleString()}</p>
          </div>
          {canViewFinance && (
            <div className={`p-4 sm:p-6 rounded-2xl sm:rounded-3xl border shadow-sm flex flex-col justify-between ${netProfit >= 0 ? 'bg-slate-900 border-slate-800' : 'bg-rose-50 border-rose-200'}`}>
               <div className={`h-8 w-8 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center mb-3 ${netProfit >= 0 ? 'bg-white/10' : 'bg-rose-100'}`}><Building2 className={`h-4 w-4 sm:h-5 sm:w-5 ${netProfit >= 0 ? 'text-white' : 'text-rose-600'}`} /></div>
               <p className={`text-[8px] sm:text-[10px] font-bold uppercase tracking-widest mb-0.5 truncate ${netProfit >= 0 ? 'text-slate-300' : 'text-rose-500'}`}>Net Profit</p>
               <p className={`text-lg sm:text-2xl font-black truncate ${netProfit >= 0 ? 'text-white' : 'text-rose-600'}`}>₹{netProfit.toLocaleString()}</p>
            </div>
          )}
        </div>

        <div className="flex gap-3 sm:gap-4 border-b border-slate-200 overflow-x-auto max-sm:[&::-webkit-scrollbar]:hidden">
           <button onClick={() => setActiveTab('projects')} className={`pb-2.5 sm:pb-3 text-[12px] sm:text-sm font-bold tracking-wide transition-all border-b-2 whitespace-nowrap ${activeTab === 'projects' ? 'border-emerald-700 text-emerald-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Project Finances</button>
           <button onClick={() => setActiveTab('expenses')} className={`pb-2.5 sm:pb-3 text-[12px] sm:text-sm font-bold tracking-wide transition-all border-b-2 whitespace-nowrap ${activeTab === 'expenses' ? 'border-emerald-700 text-emerald-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Other Expenses</button>
        </div>

        {/* GLOBALSEARCH BAR */}
        <div className="bg-white p-2 rounded-xl sm:rounded-2xl border border-slate-100 shadow-sm flex">
          <div className="relative flex-1">
            <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 h-3.5 sm:h-4 w-3.5 sm:w-4 text-slate-400" />
            <input type="text" placeholder={activeTab === 'projects' ? "Search projects..." : "Search expenses by description or category..."} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full h-10 sm:h-11 pl-9 sm:pl-11 pr-4 rounded-lg sm:rounded-xl border-none text-[13px] sm:text-sm font-medium outline-none bg-transparent focus:ring-0 placeholder:text-slate-400" />
          </div>
        </div>

        {/* PROJECTS TAB */}
        {activeTab === 'projects' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
            {visibleProjects.length === 0 ? (
               <div className="col-span-full h-32 sm:h-40 border border-slate-200 border-dashed rounded-2xl flex items-center justify-center text-slate-400 bg-slate-50/50"><p className="text-[10px] font-bold uppercase tracking-widest">No Projects Found</p></div>
            ) : visibleProjects.map(project => {
              const pInvoices = globalInvoices.filter(i => i.project_id === project.id);
              const pPayments = globalPayments.filter(p => p.project_id === project.id);
              const pExpenses = globalExpenses.filter(e => e.project_id === project.id);

              const pMoneyIn = pInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount_paid || 0), 0);
              const pMoneyOut = pPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0) + pExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
              const pProfit = pMoneyIn - pMoneyOut;
              const clientInfo = getProjectClientInfo(project);

              return (
                <div key={project.id} onClick={() => setSelectedProjectDetails(project)} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all group cursor-pointer">
                   <div className="flex justify-between items-start mb-4 border-b border-slate-50 pb-3">
                     <div className="min-w-0 pr-2">
                       <h3 className="text-[14px] sm:text-[15px] font-bold text-slate-900 group-hover:text-emerald-700 truncate">{project.name}</h3>
                       <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 truncate">
                         {companies.find(c => c.id === project.company_id)?.name} • {clientInfo.name}
                       </p>
                     </div>
                     {canViewFinance && (
                       <span className={`px-2 py-0.5 rounded-lg text-[8px] font-bold uppercase tracking-widest shrink-0 ${pProfit >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                         {pProfit >= 0 ? 'Profit' : 'Deficit'}
                       </span>
                     )}
                   </div>

                   <div className="flex justify-between items-center gap-2">
                      {canViewFinance && (
                        <div className="flex-1 min-w-0">
                          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 truncate">Income</p>
                          <p className="text-[13px] sm:text-lg font-black text-slate-700 truncate">₹{pMoneyIn.toLocaleString()}</p>
                        </div>
                      )}
                      <div className={`flex-1 min-w-0 ${canViewFinance ? 'border-l border-slate-100 pl-2' : ''}`}>
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 truncate">Expenses</p>
                        <p className="text-[13px] sm:text-lg font-black text-slate-700 truncate">₹{pMoneyOut.toLocaleString()}</p>
                      </div>
                      {canViewFinance && (
                        <div className={`flex-1 min-w-0 border-l border-slate-100 pl-2 ${pProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                          <p className="text-[8px] font-bold uppercase tracking-widest mb-0.5 opacity-70 truncate">Profit</p>
                          <p className="text-[14px] sm:text-xl font-black truncate">₹{pProfit.toLocaleString()}</p>
                        </div>
                      )}
                   </div>
                </div>
              )
            })}
          </div>
        )}

        {/* EXPENSES TAB */}
        {activeTab === 'expenses' && (
          <div className="space-y-4">
             <div className="flex flex-col sm:flex-row justify-between gap-3">
               <div className="flex items-center gap-2">
                 <Filter className="h-4 w-4 text-slate-400" />
                 <select value={expenseStatusFilter} onChange={(e) => setExpenseStatusFilter(e.target.value)} className="h-10 border border-slate-200 rounded-xl px-3 text-xs font-bold text-slate-600 outline-none">
                   <option value="all">All Statuses</option>
                   <option value="completed">Completed</option>
                   <option value="pending">Pending</option>
                   <option value="due">Due</option>
                 </select>
               </div>
               <button onClick={handleOpenNewExpense} className="bg-white border border-slate-200 text-slate-700 shadow-sm hover:shadow-md px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center">
                 <Plus className="h-4 w-4 mr-1.5" /> Add Expense
               </button>
             </div>
             
             <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
               <div className="overflow-x-auto max-sm:[&::-webkit-scrollbar]:hidden">
                 <table className="w-full text-left text-xs sm:text-sm min-w-[600px]">
                   <thead className="bg-slate-50 border-b border-slate-100">
                     <tr>
                       <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest text-[9px] whitespace-nowrap">Date & Details</th>
                       <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest text-[9px] whitespace-nowrap">Category / Project</th>
                       <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest text-[9px] whitespace-nowrap">Status & Due</th>
                       <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest text-[9px] text-right whitespace-nowrap">Amount</th>
                       <th className="px-4 py-3 font-bold text-slate-400 uppercase tracking-widest text-[9px] text-right whitespace-nowrap">Actions</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                     {visibleExpenses.length === 0 ? (
                       <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 italic">No expenses match your filters.</td></tr>
                     ) : visibleExpenses.map(exp => (
                       <tr key={exp.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-4 py-3">
                            <p className="font-bold text-[12px] sm:text-[14px] text-slate-800 truncate max-w-[200px]">{exp.description}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{exp.expense_date ? new Date(exp.expense_date).toLocaleDateString() : ''}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider block w-max mb-1">{exp.category}</span>
                            <span className="text-[10px] text-slate-500 font-medium">{exp.project_id ? projects.find(p=>p.id===exp.project_id)?.name : 'General'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider 
                                ${exp.status?.toLowerCase() === 'completed' ? 'bg-emerald-100 text-emerald-700' 
                                  : exp.status?.toLowerCase() === 'due' ? 'bg-rose-100 text-rose-700' 
                                  : 'bg-amber-100 text-amber-700'}`}>
                                {exp.status || 'Completed'}
                              </span>
                              {exp.status?.toLowerCase() !== 'completed' && (
                                <button onClick={() => { setCompletingExpense(exp); setCompletionDate(today); }} className="text-[9px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-bold transition-colors">
                                  Mark Paid
                                </button>
                              )}
                            </div>
                            {exp.due_date && <p className="text-[9px] font-bold text-slate-400 mt-1 flex items-center gap-1"><Clock className="h-3 w-3"/> Due: {new Date(exp.due_date).toLocaleDateString()}</p>}
                          </td>
                          <td className="px-4 py-3 text-right font-black text-slate-900 text-[13px] sm:text-base">
                            ₹{parseFloat(exp.amount || 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                               <button onClick={() => handleEditExpense(exp)} className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md transition-colors"><Edit2 className="h-3.5 w-3.5" /></button>
                               <button onClick={() => handleDeleteExpense(exp.id)} className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-md transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
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

      {/* MARK EXPENSE COMPLETE MODAL */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {completingExpense && (
            <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center sm:p-4 bg-slate-900/40 backdrop-blur-sm print:hidden">
              <motion.div initial={{ opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.95 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden border border-slate-100">
                <div className="px-6 py-5 border-b border-slate-100 bg-[#FAFCFF] flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 tracking-tight">Mark as Completed</h3>
                  <button onClick={() => setCompletingExpense(null)} className="h-8 w-8 bg-white border border-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 shadow-sm"><X className="h-4 w-4" /></button>
                </div>
                
                <div className="p-6 space-y-4">
                   <p className="text-sm text-slate-600">Please provide the exact date this expense was cleared.</p>
                   <div>
                     <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Completion Date *</label>
                     <input type="date" value={completionDate} onChange={e => setCompletionDate(e.target.value)} className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm font-medium outline-none focus:border-emerald-500" />
                   </div>
                </div>

                <div className="p-6 border-t border-slate-100 bg-[#FAFCFF] flex justify-end gap-3 shrink-0">
                   <button onClick={() => setCompletingExpense(null)} className="rounded-xl border border-slate-200 bg-white h-11 px-6 font-bold text-sm text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                   <button onClick={handleMarkCompleted} disabled={isSaving || !completionDate} className="bg-emerald-600 text-white rounded-xl h-11 px-8 font-bold text-sm shadow-md hover:bg-emerald-700 transition-all disabled:opacity-50">{isSaving ? "Saving..." : "Confirm"}</button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* PROJECT FINANCIAL DETAILS MODAL */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {selectedProjectDetails && (
            <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center sm:p-4 bg-slate-900/40 backdrop-blur-sm print:hidden">
              <motion.div initial={{ opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.95 }} className="bg-white rounded-[2rem] shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
                <div className="px-5 py-5 border-b border-slate-100 bg-[#FAFCFF] shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Financial Details</span>
                      <h3 className="text-xl font-bold text-slate-900 mt-2 truncate">{selectedProjectDetails.name}</h3>
                    </div>
                    <button onClick={() => setSelectedProjectDetails(null)} className="h-8 w-8 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 shadow-sm"><X className="h-4 w-4" /></button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 bg-white space-y-6">
                  {(() => {
                    const pInvoices = globalInvoices.filter(i => i.project_id === selectedProjectDetails.id);
                    const pPayments = globalPayments.filter(p => p.project_id === selectedProjectDetails.id);
                    const pExpenses = globalExpenses.filter(e => e.project_id === selectedProjectDetails.id);

                    const pExpected = parseFloat(selectedProjectDetails.expected_amount || 0);
                    const pMoneyIn = pInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount_paid || 0), 0);
                    const pTotalOut = pPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0) + pExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
                    const pProfit = pMoneyIn - pTotalOut;

                    return (
                      <>
                        <div className={`grid gap-3 sm:gap-4 ${canViewFinance ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-1 max-w-sm'}`}>
                          {canViewFinance && (
                            <>
                              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Expected Revenue</p>
                                <p className="text-[15px] font-black text-slate-700">₹{pExpected.toLocaleString()}</p>
                              </div>
                              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 text-center">
                                <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Income</p>
                                <p className="text-[15px] font-black text-emerald-700">₹{pMoneyIn.toLocaleString()}</p>
                              </div>
                            </>
                          )}
                          <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 text-center">
                            <p className="text-[9px] font-bold text-amber-600 uppercase tracking-widest mb-1">Total Costs</p>
                            <p className="text-[15px] font-black text-amber-700">₹{pTotalOut.toLocaleString()}</p>
                          </div>
                          {canViewFinance && (
                            <div className={`p-4 rounded-xl border text-center ${pProfit >= 0 ? 'bg-indigo-50 border-indigo-100' : 'bg-rose-50 border-rose-100'}`}>
                              <p className={`text-[9px] font-bold uppercase tracking-widest mb-1 ${pProfit >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>Profit</p>
                              <p className={`text-[15px] font-black ${pProfit >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>₹{pProfit.toLocaleString()}</p>
                            </div>
                          )}
                        </div>

                        <div className={`grid gap-6 ${canViewFinance ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
                          {canViewFinance && (
                            <div className="space-y-3">
                              <h4 className="text-[12px] font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2"><FileText className="h-4 w-4 text-emerald-500" /> Invoices</h4>
                              {pInvoices.length === 0 ? <p className="text-xs italic text-slate-400">No invoices generated.</p> : (
                                <div className="space-y-2">
                                  {pInvoices.map(inv => (
                                    <div key={inv.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                                      <div className="flex justify-between">
                                        <p className="font-bold text-slate-900 text-xs">{inv.invoice_number}</p>
                                        <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-emerald-100 text-emerald-700">{inv.status}</span>
                                      </div>
                                      <div className="flex justify-between items-end mt-2">
                                        <div className="text-[9px] font-bold text-slate-400">Total: ₹{parseFloat(inv.total_amount || 0).toLocaleString()}</div>
                                        <div className="text-xs font-black text-emerald-600">Paid: ₹{parseFloat(inv.amount_paid || 0).toLocaleString()}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="space-y-5">
                            <div className="space-y-3">
                              <h4 className="text-[12px] font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2"><Users className="h-4 w-4 text-blue-500" /> Project Payroll</h4>
                              {pPayments.length === 0 ? <p className="text-xs italic text-slate-400">No employee payments recorded.</p> : (
                                <div className="space-y-2">
                                  {pPayments.map(p => {
                                    const emp = employees.find(e => e.id === p.employee_id);
                                    return (
                                      <div key={p.id} className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 flex justify-between items-center">
                                        <div>
                                          <p className="text-xs font-bold text-slate-800">{emp?.name || 'Unknown'}</p>
                                          <p className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">{p.payment_date ? new Date(p.payment_date).toLocaleDateString() : ''}</p>
                                        </div>
                                        <p className="text-sm font-black text-slate-700">₹{parseFloat(p.amount || 0).toLocaleString()}</p>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            <div className="space-y-3">
                              <h4 className="text-[12px] font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2"><Receipt className="h-4 w-4 text-amber-500" /> Other Expenses</h4>
                              {pExpenses.length === 0 ? <p className="text-xs italic text-slate-400">No other expenses recorded.</p> : (
                                <div className="space-y-2">
                                  {pExpenses.map(e => (
                                    <div key={e.id} className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 flex justify-between items-center">
                                      <div>
                                        <p className="text-xs font-bold text-slate-800">{e.description}</p>
                                        <p className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">{e.expense_date ? new Date(e.expense_date).toLocaleDateString() : ''} • {e.category}</p>
                                      </div>
                                      <p className="text-sm font-black text-slate-700">₹{parseFloat(e.amount || 0).toLocaleString()}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
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

      {/* ADD/EDIT EXPENSE MODAL */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isExpenseModalOpen && (
            <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center sm:p-4 bg-slate-900/40 backdrop-blur-sm print:hidden">
              <motion.div initial={{ opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.95 }} className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg flex flex-col overflow-hidden border border-slate-100">
                <div className="px-6 py-5 border-b border-slate-100 bg-[#FAFCFF] flex items-center justify-between">
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">{editingExpenseId ? 'Edit Record' : 'New Expense'}</span>
                    <h3 className="text-lg font-bold text-slate-900 tracking-tight mt-1.5">{editingExpenseId ? 'Edit Expense' : 'Add Expense'}</h3>
                  </div>
                  <button onClick={() => setIsExpenseModalOpen(false)} className="h-8 w-8 bg-white border border-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 shadow-sm"><X className="h-4 w-4" /></button>
                </div>
                
                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                   {isAdmin && !activeWorkspace && (
                     <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Company</label>
                     <select value={expenseForm.company_id} onChange={e=>setExpenseForm({...expenseForm, company_id: e.target.value, project_id: ""})} className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none"><option value="">-- Select --</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                   )}
                   <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Description *</label>
                   <input type="text" value={expenseForm.description} onChange={e=>setExpenseForm({...expenseForm, description: e.target.value})} className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm font-medium outline-none" placeholder="E.g., Server Hosting, Travel..." /></div>
                   
                   <div className="grid grid-cols-2 gap-4">
                     <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Amount (₹) *</label>
                     <input type="number" value={expenseForm.amount} onChange={e=>setExpenseForm({...expenseForm, amount: parseFloat(e.target.value)||0})} className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm font-black text-slate-800 outline-none" /></div>
                     <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Date</label>
                     <input type="date" value={expenseForm.expense_date} onChange={e=>setExpenseForm({...expenseForm, expense_date: e.target.value})} className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm font-medium outline-none" /></div>
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                     <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Category</label>
                     <select value={expenseForm.category} onChange={e=>setExpenseForm({...expenseForm, category: e.target.value})} className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm font-medium outline-none"><option>Software</option><option>Office/Rent</option><option>Marketing</option><option>Travel</option><option>Materials</option><option>Payroll</option><option>Other</option></select></div>
                     <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 truncate">Link Project</label>
                     <select value={expenseForm.project_id} onChange={e=>setExpenseForm({...expenseForm, project_id: e.target.value})} disabled={!expenseForm.company_id} className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm font-medium outline-none disabled:opacity-50"><option value="">-- General --</option>{globalProjects.filter(p=>p.company_id.toString()===expenseForm.company_id).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                     <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Status</label>
                     <select value={expenseForm.status} onChange={e=>setExpenseForm({...expenseForm, status: e.target.value})} className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm font-medium outline-none"><option value="Completed">Completed</option><option value="Pending">Pending</option><option value="Due">Due</option></select></div>
                     <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Due Date (Optional)</label>
                     <input type="date" value={expenseForm.due_date} onChange={e=>setExpenseForm({...expenseForm, due_date: e.target.value})} className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm font-medium outline-none" /></div>
                   </div>
                </div>

                <div className="p-6 border-t border-slate-100 bg-[#FAFCFF] flex justify-end gap-3 shrink-0">
                   <button onClick={() => setIsExpenseModalOpen(false)} className="rounded-xl border border-slate-200 bg-white h-11 px-6 font-bold text-sm text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                   <button onClick={handleSaveExpense} disabled={isSaving} className="bg-slate-900 text-white rounded-xl h-11 px-8 font-bold text-sm shadow-md hover:shadow-lg transition-all">{isSaving ? "Saving..." : (editingExpenseId ? "Update" : "Add")}</button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* --- FINANCIAL REPORT GENERATOR MODAL & PRINT VIEW --- */}
      {canViewFinance && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isReportModalOpen && (
            <div className="fixed inset-0 z-[10000] flex flex-col bg-slate-900/40 backdrop-blur-sm overflow-y-auto sm:p-4 print:static print:inset-auto print:p-0 print:bg-white print:block print:h-auto print:overflow-visible">
              <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }} className="bg-white min-h-full sm:min-h-[90vh] w-full max-w-5xl mx-auto sm:rounded-2xl shadow-2xl flex flex-col relative print:shadow-none print:m-0 print:min-h-0 print:h-auto print:w-full print:rounded-none print:block print:overflow-visible print:static">
                
                {/* Print Control Header - Hidden during print */}
                <div className="bg-slate-900 text-white p-4 sm:p-5 sm:rounded-t-2xl flex flex-col gap-4 shrink-0 print:hidden relative">
                   {/* Top Row: Title + Right Actions */}
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                         <div className="h-8 w-8 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                           <BarChart3 className="h-4 w-4 text-indigo-400" />
                         </div>
                         <h2 className="text-lg font-bold tracking-tight">Financial Report</h2>
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0">
                         <button onClick={() => window.print()} className="bg-indigo-600 hover:bg-indigo-500 text-white h-9 px-4 rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center">
                           <Download className="h-3.5 w-3.5 sm:mr-2"/> <span className="hidden sm:inline">Save PDF</span>
                         </button>
                         <button onClick={() => setIsReportModalOpen(false)} className="h-9 w-9 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg flex items-center justify-center transition-colors">
                           <X className="h-4 w-4" />
                         </button>
                      </div>
                   </div>

                   {/* Filter Row */}
                   <div className="flex flex-wrap items-center gap-3">
                      {isAdmin && !activeWorkspace ? (
                        <select value={reportConfig.companyId} onChange={e=>setReportConfig({...reportConfig, companyId: e.target.value})} className="bg-slate-800 text-white border border-slate-700 h-9 px-3 rounded-lg text-xs font-medium outline-none cursor-pointer">
                          <option value="all">All Companies</option>
                          {companies.map(c=><option key={c.id} value={c.id.toString()}>{c.name}</option>)}
                        </select>
                      ) : (
                        <div className="bg-slate-800 text-white border border-slate-700 h-9 px-4 rounded-lg text-xs font-medium flex items-center">
                          {companies.find(c => c.id.toString() === reportConfig.companyId)?.name || 'Your Subsidiary'}
                        </div>
                      )}
                      
                      <select value={reportConfig.datePreset} onChange={(e) => handlePresetChange(e.target.value)} className="bg-slate-800 text-white border border-slate-700 h-9 px-3 rounded-lg text-xs font-medium outline-none cursor-pointer">
                         <option value="custom">Custom Range</option>
                         <option value="this_month">This Month</option>
                         <option value="last_month">Last Month</option>
                         <option value="ytd">Year to Date</option>
                         <option value="all_time">All Time</option>
                      </select>

                      <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-2 h-9 border border-slate-700">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        <input type="date" value={reportConfig.startDate} onChange={e=>setReportConfig({...reportConfig, startDate: e.target.value, datePreset: 'custom'})} className="bg-transparent text-white text-xs outline-none w-[110px]" />
                        <span className="text-slate-500">-</span>
                        <input type="date" value={reportConfig.endDate} onChange={e=>setReportConfig({...reportConfig, endDate: e.target.value, datePreset: 'custom'})} className="bg-transparent text-white text-xs outline-none w-[110px]" />
                      </div>
                   </div>
                </div>

                {/* --- ACTUAL REPORT CONTENT --- */}
                <div className="p-8 sm:p-12 flex-1 bg-white print:p-8 print:block print:h-auto print:overflow-visible" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                   
                   {/* Intelligent Headers with Logos */}
                   <div className="flex justify-between items-start mb-10 border-b border-slate-200 pb-8">
                      {/* Left: Parent Company Logo */}
                      <div className="flex flex-col items-start w-1/3">
                         {parentCompany?.logo_url ? (
                            <img src={parentCompany.logo_url} alt="Parent Logo" className="h-14 object-contain mb-2 print:h-12" />
                         ) : (
                            <div className="h-12 w-12 rounded-xl bg-slate-900 flex items-center justify-center text-white text-xl font-black mb-2 print:h-10 print:w-10" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                              {parentCompany?.name ? parentCompany.name.charAt(0) : 'Z'}
                            </div>
                         )}
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{parentCompany?.name || 'Zac Holdings'}</p>
                         <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mt-0.5">Parent Entity</p>
                      </div>

                      {/* Center: Report Details */}
                      <div className="text-center w-1/3">
                        <h1 className="text-2xl font-black text-slate-900 mb-1 uppercase tracking-tight print:text-xl">Financial Report</h1>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                          {reportConfig.companyId === 'all' ? 'Consolidated Overview' : selectedCompany?.name}
                        </p>
                        <p className="text-[10px] text-slate-400 bg-slate-50 inline-block px-3 py-1 rounded-full border border-slate-100" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                          {reportConfig.startDate ? new Date(reportConfig.startDate).toLocaleDateString() : 'Beginning'} — {reportConfig.endDate ? new Date(reportConfig.endDate).toLocaleDateString() : 'Present'}
                        </p>
                      </div>

                      {/* Right: Selected Subsidiary Logo (if different) */}
                      <div className="flex flex-col items-end text-right w-1/3">
                         {showBothLogos && selectedCompany && (
                            <>
                               {selectedCompany.logo_url ? (
                                  <img src={selectedCompany.logo_url} alt="Sub Logo" className="h-14 object-contain mb-2 print:h-12" />
                               ) : (
                                  <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 text-xl font-black mb-2 print:h-10 print:w-10" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                                    {selectedCompany.name.charAt(0)}
                                  </div>
                               )}
                               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{selectedCompany.name}</p>
                               <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mt-0.5">Subject Entity</p>
                            </>
                         )}
                      </div>
                   </div>

                   {/* KPI Grid - 2x2 layout ensures ample width for large numbers */}
                   <div className="grid grid-cols-2 sm:grid-cols-2 gap-4 sm:gap-6 mb-12 print:grid-cols-2 print:gap-6 print:mb-10">
                     <div className="border-l-4 border-emerald-500 bg-slate-50 p-4 sm:p-6 rounded-r-xl" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                       <p className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5 whitespace-nowrap"><ArrowDownLeft className="h-3.5 w-3.5 text-emerald-500" /> Total Income</p>
                       <p className="text-xl sm:text-2xl font-black text-slate-900 break-words">₹{reportStats.inc.toLocaleString()}</p>
                     </div>
                     <div className="border-l-4 border-rose-500 bg-slate-50 p-4 sm:p-6 rounded-r-xl" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                       <p className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5 whitespace-nowrap"><ArrowUpRight className="h-3.5 w-3.5 text-rose-500" /> Total Expenses</p>
                       <p className="text-xl sm:text-2xl font-black text-slate-900 break-words">₹{reportStats.exp.toLocaleString()}</p>
                     </div>
                     <div className={`border-l-4 p-4 sm:p-6 rounded-r-xl ${reportStats.prof >= 0 ? 'border-indigo-500 bg-indigo-50' : 'border-rose-500 bg-rose-50'}`} style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                       <p className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-widest mb-1.5 whitespace-nowrap ${reportStats.prof >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>Net Profit</p>
                       <p className={`text-xl sm:text-2xl font-black break-words ${reportStats.prof >= 0 ? 'text-indigo-900' : 'text-rose-900'}`}>₹{reportStats.prof.toLocaleString()}</p>
                     </div>
                     <div className="border-l-4 border-slate-300 bg-slate-50 p-4 sm:p-6 rounded-r-xl" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                       <p className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 whitespace-nowrap">Profit Margin</p>
                       <p className="text-xl sm:text-2xl font-black text-slate-900 break-words">{reportStats.margin}%</p>
                     </div>
                   </div>

                   {/* Charts & Breakdown */}
                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12 print:grid print:grid-cols-2 print:gap-6 print:mb-10">
                     
                      {/* Bar Chart */}
                      <div className="border border-slate-100 rounded-2xl p-6 bg-white shadow-sm flex flex-col print:p-5 print:shadow-none print:border-slate-200">
                         <h3 className="text-sm font-bold text-slate-800 mb-6 flex items-center print:text-xs"><BarChart3 className="h-4 w-4 mr-2 text-indigo-500 print:h-3 print:w-3"/> Monthly Cash Flow</h3>
                         <div className="flex-1 min-h-[200px] flex items-end gap-2 sm:gap-4 relative pt-10 px-2 border-b border-slate-200 print:min-h-[160px]">
                           {reportStats.chartData.length === 0 ? <p className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 italic">No monthly data available.</p> : null}
                           {reportStats.chartData.map((data, idx) => {
                             const incHeight = Math.max((data.inc / (reportStats.maxChartVal || 1)) * 100, 2);
                             const expHeight = Math.max((data.exp / (reportStats.maxChartVal || 1)) * 100, 2);
                             return (
                               <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                                 <div className="flex items-end justify-center w-full gap-1 sm:gap-1.5 h-full z-10 pb-1">
                                   <div style={{ height: `${incHeight}%`, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} className="w-full max-w-[20px] bg-emerald-400 rounded-t-sm relative transition-all">
                                     <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] font-bold text-emerald-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap print:opacity-100 print:text-[6px]">₹{(data.inc/1000).toFixed(0)}k</span>
                                   </div>
                                   <div style={{ height: `${expHeight}%`, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} className="w-full max-w-[20px] bg-rose-400 rounded-t-sm relative transition-all">
                                     <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] font-bold text-rose-700 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap print:opacity-100 print:text-[6px]">₹{(data.exp/1000).toFixed(0)}k</span>
                                   </div>
                                 </div>
                                 <span className="text-[9px] font-bold text-slate-400 mt-2 absolute -bottom-5 truncate w-full text-center print:text-[7px]">{data.month}</span>
                               </div>
                             )
                           })}
                         </div>
                         <div className="flex justify-center gap-6 mt-10 text-[9px] font-bold uppercase tracking-widest print:mt-8 print:text-[7px]">
                           <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-emerald-400 rounded-sm print:bg-emerald-400" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}></div> Income</div>
                           <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-rose-400 rounded-sm print:bg-rose-400" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}></div> Expense</div>
                         </div>
                      </div>

                      {/* Line Chart Component (Cash Flow Trend) */}
                      <div className="border border-slate-100 rounded-2xl p-6 bg-white shadow-sm print:p-5 print:shadow-none print:border-slate-200 flex flex-col">
                         <h3 className="text-sm font-bold text-slate-800 mb-6 flex items-center print:text-xs">
                           <Activity className="h-4 w-4 mr-2 text-indigo-500 print:h-3 print:w-3"/> Cash Flow Trend
                         </h3>
                         <div className="flex-1 relative w-full min-h-[200px] print:min-h-[160px]">
                            {reportStats.chartData.length === 0 ? (
                               <p className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 italic">No monthly data available.</p>
                            ) : (
                               <>
                                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full absolute inset-0 overflow-visible">
                                    {/* Grid lines */}
                                    <line x1="0" y1="25" x2="100" y2="25" stroke="#f1f5f9" strokeWidth="0.5" />
                                    <line x1="0" y1="50" x2="100" y2="50" stroke="#f1f5f9" strokeWidth="0.5" />
                                    <line x1="0" y1="75" x2="100" y2="75" stroke="#f1f5f9" strokeWidth="0.5" />
                                    <line x1="0" y1="100" x2="100" y2="100" stroke="#e2e8f0" strokeWidth="1" />
                                    
                                    {/* Lines */}
                                    {reportStats.chartData.length > 1 && (
                                       <>
                                         <polyline points={lineChartIncPoints} fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                         <polyline points={lineChartExpPoints} fill="none" stroke="#fb7185" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                       </>
                                    )}
                                    {/* Data points */}
                                    {reportStats.chartData.map((d, i) => {
                                       const x = reportStats.chartData.length > 1 ? (i / (reportStats.chartData.length - 1)) * 100 : 50;
                                       const incY = 100 - (d.inc / (reportStats.maxChartVal || 1)) * 100;
                                       const expY = 100 - (d.exp / (reportStats.maxChartVal || 1)) * 100;
                                       return (
                                         <g key={i}>
                                           <circle cx={x} cy={incY} r="1.5" fill="#34d399" />
                                           <circle cx={x} cy={expY} r="1.5" fill="#fb7185" />
                                         </g>
                                       )
                                    })}
                                  </svg>
                                  {/* X Axis Labels */}
                                  <div className="absolute -bottom-5 left-0 w-full">
                                    {reportStats.chartData.map((d, i) => {
                                      const leftPos = reportStats.chartData.length > 1 ? (i / (reportStats.chartData.length - 1)) * 100 : 50;
                                      return (
                                        <span key={i} className="text-[9px] font-bold text-slate-400 print:text-[7px] absolute whitespace-nowrap" style={{ left: `${leftPos}%`, transform: 'translateX(-50%)' }}>
                                          {d.month}
                                        </span>
                                      )
                                    })}
                                  </div>
                               </>
                            )}
                         </div>
                         <div className="flex justify-center gap-6 mt-10 text-[9px] font-bold uppercase tracking-widest print:mt-8 print:text-[7px]">
                           <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-emerald-400 rounded-sm print:bg-emerald-400" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}></div> Income Trend</div>
                           <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-rose-400 rounded-sm print:bg-rose-400" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}></div> Expense Trend</div>
                         </div>
                      </div>

                      {/* Category Breakdown (Spans both columns) */}
                      <div className="lg:col-span-2 border border-slate-100 rounded-2xl p-6 bg-white shadow-sm print:col-span-2 print:p-5 print:shadow-none print:border-slate-200">
                         <h3 className="text-sm font-bold text-slate-800 mb-6 flex items-center print:text-xs"><PieChart className="h-4 w-4 mr-2 text-rose-500 print:h-3 print:w-3"/> Expense Distribution</h3>
                         <div className="space-y-4 print:space-y-3">
                            {reportStats.sortedCategories.length === 0 ? <p className="text-xs text-slate-400 italic">No expenses logged.</p> : null}
                            {reportStats.sortedCategories.map((item, idx) => {
                               const percentage = ((item.amount / reportStats.exp) * 100).toFixed(1);
                               return (
                                 <div key={idx}>
                                    <div className="flex justify-between items-end mb-1 text-[11px] font-bold print:text-[9px]">
                                       <span className="text-slate-600">{item.category}</span>
                                       <span className="text-slate-900">₹{item.amount.toLocaleString()} <span className="text-slate-400 font-medium ml-1">({percentage}%)</span></span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-1.5 print:h-1" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                                       <div className="bg-rose-400 h-1.5 rounded-full print:h-1" style={{ width: `${percentage}%`, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}></div>
                                    </div>
                                 </div>
                               )
                            })}
                         </div>
                      </div>
                   </div>

                   {/* DETAILED LEDGERS */}
                   <div className="print:break-inside-avoid">
                      <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-3 mb-4 print:text-xs bg-slate-50/50 print:bg-slate-50 px-2 pt-2">Income Ledger</h3>
                      <table className="w-full text-left text-[11px] mb-10 print:text-[9px]">
                         <thead className="text-slate-400 uppercase tracking-widest text-[9px] print:text-[8px] border-b border-slate-100">
                            <tr>
                               <th className="pb-2 font-bold px-2">Date</th>
                               <th className="pb-2 font-bold px-2">Ref / Invoice No</th>
                               <th className="pb-2 font-bold px-2">Client / Entity</th>
                               <th className="pb-2 font-bold text-right px-2">Amount</th>
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-50">
                            {reportStats.incList.length === 0 ? (
                               <tr><td colSpan={4} className="py-4 text-slate-400 italic text-center">No income recorded.</td></tr>
                            ) : (
                               reportStats.incList.map((inc, i) => (
                                  <tr key={i}>
                                     <td className="py-2 px-2 text-slate-500 font-medium">{inc.date ? new Date(inc.date).toLocaleDateString() : '-'}</td>
                                     <td className="py-2 px-2 font-bold text-slate-800">{inc.ref}</td>
                                     <td className="py-2 px-2 text-slate-600">{inc.client}</td>
                                     <td className="py-2 px-2 font-black text-emerald-600 text-right">₹{inc.amount.toLocaleString()}</td>
                                  </tr>
                               ))
                            )}
                         </tbody>
                      </table>
                   </div>

                   <div className="print:break-inside-avoid">
                      <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-3 mb-4 print:text-xs bg-slate-50/50 print:bg-slate-50 px-2 pt-2">Expense Ledger</h3>
                      <table className="w-full text-left text-[11px] print:text-[9px]">
                         <thead className="text-slate-400 uppercase tracking-widest text-[9px] print:text-[8px] border-b border-slate-100">
                            <tr>
                               <th className="pb-2 font-bold w-24 px-2">Date</th>
                               <th className="pb-2 font-bold w-32 px-2">Category</th>
                               <th className="pb-2 font-bold px-2">Description</th>
                               <th className="pb-2 font-bold text-right px-2">Amount</th>
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-50">
                            {reportStats.expList.length === 0 ? (
                               <tr><td colSpan={4} className="py-4 text-slate-400 italic text-center">No expenses recorded.</td></tr>
                            ) : (
                               reportStats.expList.map((exp, i) => (
                                  <tr key={i} className="print:break-inside-avoid">
                                     <td className="py-2.5 px-2 text-slate-500 font-medium align-top">{exp.date ? new Date(exp.date).toLocaleDateString() : '-'}</td>
                                     <td className="py-2.5 px-2 align-top">
                                        <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                                           {exp.cat}
                                        </span>
                                     </td>
                                     <td className="py-2.5 px-2 text-slate-800 font-medium pr-4">{exp.desc}</td>
                                     <td className="py-2.5 px-2 font-black text-rose-600 text-right align-top">₹{exp.amount.toLocaleString()}</td>
                                  </tr>
                               ))
                            )}
                         </tbody>
                      </table>
                   </div>

                   <div className="text-center text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-16 pt-8 border-t border-slate-100 print:mt-8 print:pt-4 print:text-[7px]">
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