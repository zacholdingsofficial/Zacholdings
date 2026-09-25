import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useDataStore } from "../../store/dataStore";

import StandardProjects from "./variants/StandardProjects";
import AcademyCourses from "./variants/AcademyCourses";
// import ConstructionSites from "./variants/ConstructionSites";

export default function ProjectsPage() {
  const { role, activeWorkspace, companyId } = useAuthStore();
  const { companies } = useDataStore();
  
  const location = useLocation();
  const navigate = useNavigate();

  const [targetProjectId, setTargetProjectId] = useState<number | null>(null);
  const [overrideCompanyId, setOverrideCompanyId] = useState<number | null>(null);

  // Catch the redirect signal from the Customers Page or Global Admin Dashboard
  useEffect(() => {
    if (location.state?.openProjectId) {
      setTargetProjectId(location.state.openProjectId);
      
      // If a specific company was requested (e.g., clicking an Academy project from standard view)
      if (location.state.targetCompanyId) {
        setOverrideCompanyId(location.state.targetCompanyId);
      }
      
      // Clear the router state immediately so refresh doesn't trigger it again
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  // Function to clear the override when the modal closes
  const handleClearOverride = () => {
    setTargetProjectId(null);
    setOverrideCompanyId(null);
  };

  // 1. Determine which company we are currently viewing
  // If an override is active, use that. Otherwise, fallback to the standard active workspace logic.
  const effectiveCompanyId = overrideCompanyId || ((role === 'admin' || role === 'head') && activeWorkspace ? activeWorkspace : companyId);
  const currentCompany = companies.find((c: any) => c.id == effectiveCompanyId);

  // 2. Extract the business type (fallback to 'normal' if undefined)
  const businessType = currentCompany?.business_type || 'normal';

  // 3. The Strategy Pattern Router
  switch (businessType) {
    case 'academy':
      return (
        <AcademyCourses 
          autoOpenProjectId={targetProjectId} 
          forcedCompanyId={overrideCompanyId} 
          onClearOverride={handleClearOverride} 
        />
      ); 
      
    case 'construction':
      return (
        <StandardProjects 
          autoOpenProjectId={targetProjectId} 
          forcedCompanyId={overrideCompanyId} 
          onClearOverride={handleClearOverride} 
        />
      ); // Placeholder
      
    case 'normal':
    default:
      return (
        <StandardProjects 
          autoOpenProjectId={targetProjectId} 
          forcedCompanyId={overrideCompanyId} 
          onClearOverride={handleClearOverride} 
        />
      );
  }
}