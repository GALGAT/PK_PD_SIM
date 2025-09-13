import { useState, useEffect, useCallback, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, BarChart, Bar, Area, AreaChart, ReferenceArea } from 'recharts';
import html2canvas from 'html2canvas';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { FlaskConical, Ban, TrendingUp, Settings, Play, RotateCcw, Download, ChartArea, RefreshCw, Table, Expand, FileImage, FileText, Target, ZoomIn, ZoomOut } from "lucide-react";

interface DrugParams {
  dosingInterval: number;
  infusionTime: number;
  halfLife: number;
  maxConcentration: number;
}

interface InhibitorParams {
  dosingInterval: number;
  infusionTime: number;
  halfLife: number;
  maxConcentration: number;
}

interface PDParams {
  log2MIC0: number;
  imax: number;
  ic50: number;
  hillCoeff: number;
}

interface SimParams {
  numCycles: number;
  timeStep: number;
}

interface Results {
  drugAUC: string;
  inhibitorAUC: string;
  exposureRatio: string;
  inverseExposureRatio: string;
  percentTOverMIC: string;
  drugMinConc: string;
  inhibitorMinConc: string;
  kDrug: string;
  kInhibitor: string;
}

interface ChartDataPoint {
  time: number;
  drug: number;
  inhibitor: number;
  mic: number;
}

interface CycleResult {
  cycle: number;
  drugAUC: number;
  inhibitorAUC: number;
  exposureRatio: number;
  percentTOverMIC: number;
  timePoints: number[];
  drugConcentrations: number[];
  inhibitorConcentrations: number[];
  micValues: number[];
}

interface OptimizationTarget {
  minEffectiveConc: number;
  maxSafeConc: number;
  targetTOverMIC: number;
}

interface OptimizationRecommendation {
  recommendedInterval: number;
  recommendedDose: number;
  expectedTOverMIC: number;
  expectedPeakConc: number;
  expectedTroughConc: number;
  riskAssessment: string;
  confidence: number;
}

// Export functions
const exportToCSV = (data: ChartDataPoint[], filename: string) => {
  const headers = ['Time (hours)', 'Drug Concentration (μg/mL)', 'Inhibitor Concentration (μg/mL)', 'MIC (μg/mL)'];
  const csvContent = [
    headers.join(','),
    ...data.map(row => [row.time, row.drug, row.inhibitor, row.mic].join(','))
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
};

const exportChartAsPNG = async (elementId: string, filename: string) => {
  try {
    const element = document.getElementById(elementId);
    if (element) {
      const canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false
      });
      
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL();
      link.click();
    }
  } catch (error) {
    console.error('Error exporting chart:', error);
    alert('Export failed. Please try again.');
  }
};

const exportCompleteResults = (
  drugParams: DrugParams,
  inhibitorParams: InhibitorParams,
  pdParams: PDParams,
  simParams: SimParams,
  results: Results | null,
  chartData: ChartDataPoint[],
  cycleResults: CycleResult[]
) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  // Create comprehensive results object
  const completeResults = {
    exportTimestamp: new Date().toISOString(),
    simulationParameters: {
      drug: drugParams,
      inhibitor: inhibitorParams,
      pharmacodynamics: pdParams,
      simulation: simParams
    },
    calculatedResults: results,
    concentrationData: chartData,
    cycleAnalysis: cycleResults
  };
  
  const jsonContent = JSON.stringify(completeResults, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pkpd-complete-results-${timestamp}.json`;
  link.click();
  window.URL.revokeObjectURL(url);
};


const PKPDSimulator = () => {
  const [drugParams, setDrugParams] = useState<DrugParams>({
    dosingInterval: 24,
    infusionTime: 1,
    halfLife: 6,
    maxConcentration: 100
  });

  const [inhibitorParams, setInhibitorParams] = useState<InhibitorParams>({
    dosingInterval: 24,
    infusionTime: 1,
    halfLife: 8,
    maxConcentration: 50
  });

  const [pdParams, setPdParams] = useState<PDParams>({
    log2MIC0: 2,
    imax: 3,
    ic50: 25,
    hillCoeff: 1
  });

  const [simParams, setSimParams] = useState<SimParams>({
    numCycles: 3,
    timeStep: 0.1
  });

  const [results, setResults] = useState<Results | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [cycleResults, setCycleResults] = useState<CycleResult[]>([]);
  const [showAUCVisualization, setShowAUCVisualization] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const latestRunIdRef = useRef(0);
  const isMountedRef = useRef(true);
  
  // Validation errors
  const [drugValidationErrors, setDrugValidationErrors] = useState<string[]>([]);
  const [inhibitorValidationErrors, setInhibitorValidationErrors] = useState<string[]>([]);
  
  // Zoom state for concentration chart
  const [zoomDomain, setZoomDomain] = useState<{left?: number, right?: number, top?: number, bottom?: number}>({});
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null);
  const [isZooming, setIsZooming] = useState(false);

  // Optimization state
  const [optimizationTarget, setOptimizationTarget] = useState<OptimizationTarget>({
    minEffectiveConc: 2.0,
    maxSafeConc: 50.0,
    targetTOverMIC: 80.0
  });
  const [optimizationErrors, setOptimizationErrors] = useState<string[]>([]);
  const [isApplyingRecommendations, setIsApplyingRecommendations] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<OptimizationRecommendation | null>(null);
  const [showOptimization, setShowOptimization] = useState(false);

  const calculateDecayConstant = useCallback((halfLife: number) => {
    return Math.log(2) / halfLife;
  }, []);

  const calculateMinConcentration = useCallback((maxConc: number, decayConstant: number, dosingInterval: number, infusionTime: number) => {
    return maxConc * Math.exp(-decayConstant * (dosingInterval - infusionTime));
  }, []);

  const concentrationDuringInfusion = useCallback((t: number, tCycleStart: number, infusionTime: number, minConc: number, maxConc: number) => {
    return minConc + (maxConc - minConc) * ((t - tCycleStart) / infusionTime);
  }, []);

  const concentrationDuringDecay = useCallback((t: number, tInfusionEnd: number, maxConc: number, decayConstant: number) => {
    return maxConc * Math.exp(-decayConstant * (t - tInfusionEnd));
  }, []);

  const calculateLog2MIC = useCallback((inhibitorConc: number, log2MIC0: number, imax: number, ic50: number, hillCoeff: number) => {
    const numerator = imax * Math.pow(inhibitorConc, hillCoeff);
    const denominator = Math.pow(inhibitorConc, hillCoeff) + Math.pow(ic50, hillCoeff);
    return log2MIC0 - (numerator / denominator);
  }, []);

  const calculateAUC = useCallback((timePoints: number[], concentrations: number[]) => {
    let auc = 0;
    for (let i = 1; i < timePoints.length; i++) {
      const dt = timePoints[i] - timePoints[i - 1];
      const avgConc = (concentrations[i - 1] + concentrations[i]) / 2;
      auc += avgConc * dt;
    }
    return auc;
  }, []);

  // Validation functions
  const validateDrugParams = useCallback(() => {
    const errors: string[] = [];
    if (drugParams.dosingInterval <= 0) {
      errors.push("Dosing interval must be positive");
    }
    if (drugParams.infusionTime < 0) {
      errors.push("Infusion time must be non-negative");
    }
    if (drugParams.infusionTime > drugParams.dosingInterval) {
      errors.push("Infusion time cannot exceed dosing interval");
    }
    if (drugParams.halfLife <= 0) {
      errors.push("Half-life must be positive");
    }
    if (drugParams.maxConcentration <= 0) {
      errors.push("Max concentration must be positive");
    }
    return errors;
  }, [drugParams]);

  const validateInhibitorParams = useCallback(() => {
    const errors: string[] = [];
    if (inhibitorParams.dosingInterval <= 0) {
      errors.push("Dosing interval must be positive");
    }
    if (inhibitorParams.infusionTime < 0) {
      errors.push("Infusion time must be non-negative");
    }
    if (inhibitorParams.infusionTime > inhibitorParams.dosingInterval) {
      errors.push("Infusion time cannot exceed dosing interval");
    }
    if (inhibitorParams.halfLife <= 0) {
      errors.push("Half-life must be positive");
    }
    if (inhibitorParams.maxConcentration <= 0) {
      errors.push("Max concentration must be positive");
    }
    return errors;
  }, [inhibitorParams]);

  const runSimulation = useCallback(async () => {
    // Validate parameters FIRST before touching any state
    const drugErrors = validateDrugParams();
    const inhibitorErrors = validateInhibitorParams();
    
    setDrugValidationErrors(drugErrors);
    setInhibitorValidationErrors(inhibitorErrors);
    
    // If validation fails, clear any loading state and return early
    if (drugErrors.length > 0 || inhibitorErrors.length > 0 || 
        simParams.timeStep <= 0) {
      setIsSimulating(false); // Explicitly clear loading state
      return;
    }

    // Generate unique run ID to prevent race conditions
    const runId = performance.now() + Math.random();
    latestRunIdRef.current = runId;

    setIsSimulating(true);

    const totalTime = simParams.numCycles * drugParams.dosingInterval;
    const timePoints: number[] = [];
    const drugConcentrations: number[] = [];
    const inhibitorConcentrations: number[] = [];
    const micValues: number[] = [];
    const tOverMIC: number[] = [];

    const kDrug = calculateDecayConstant(drugParams.halfLife);
    const kInhibitor = calculateDecayConstant(inhibitorParams.halfLife);

    const drugMinConc = calculateMinConcentration(
      drugParams.maxConcentration, 
      kDrug, 
      drugParams.dosingInterval, 
      drugParams.infusionTime
    );

    const inhibitorMinConc = calculateMinConcentration(
      inhibitorParams.maxConcentration, 
      kInhibitor, 
      inhibitorParams.dosingInterval, 
      inhibitorParams.infusionTime
    );

    const cycleData: CycleResult[] = [];
    for (let cycle = 0; cycle < simParams.numCycles; cycle++) {
      cycleData.push({
        cycle: cycle + 1,
        timePoints: [],
        drugConcentrations: [],
        inhibitorConcentrations: [],
        micValues: [],
        drugAUC: 0,
        inhibitorAUC: 0,
        exposureRatio: 0,
        percentTOverMIC: 0
      });
    }

    for (let t = 0; t <= totalTime; t += simParams.timeStep) {
      timePoints.push(t);
      const currentCycle = Math.floor(t / drugParams.dosingInterval);
      const timeInCycle = t % drugParams.dosingInterval;

      let drugConc: number;
      if (timeInCycle <= drugParams.infusionTime) {
        drugConc = concentrationDuringInfusion(
          t, 
          currentCycle * drugParams.dosingInterval, 
          drugParams.infusionTime, 
          drugMinConc, 
          drugParams.maxConcentration
        );
      } else {
        const infusionEndTime = currentCycle * drugParams.dosingInterval + drugParams.infusionTime;
        drugConc = concentrationDuringDecay(t, infusionEndTime, drugParams.maxConcentration, kDrug);
      }

      let inhibitorConc: number;
      const currentInhibitorCycle = Math.floor(t / inhibitorParams.dosingInterval);
      const timeInInhibitorCycle = t % inhibitorParams.dosingInterval;
      if (timeInInhibitorCycle <= inhibitorParams.infusionTime) {
        inhibitorConc = concentrationDuringInfusion(
          t, 
          currentInhibitorCycle * inhibitorParams.dosingInterval, 
          inhibitorParams.infusionTime, 
          inhibitorMinConc, 
          inhibitorParams.maxConcentration
        );
      } else {
        const infusionEndTime = currentInhibitorCycle * inhibitorParams.dosingInterval + inhibitorParams.infusionTime;
        inhibitorConc = concentrationDuringDecay(t, infusionEndTime, inhibitorParams.maxConcentration, kInhibitor);
      }

      drugConcentrations.push(drugConc);
      inhibitorConcentrations.push(inhibitorConc);

      const log2MIC = calculateLog2MIC(
        inhibitorConc, 
        pdParams.log2MIC0, 
        pdParams.imax, 
        pdParams.ic50, 
        pdParams.hillCoeff
      );
      const mic = Math.pow(2, log2MIC);
      micValues.push(mic);

      const isAboveMIC = drugConc >= mic ? 1 : 0;
      tOverMIC.push(isAboveMIC);

      if (currentCycle < simParams.numCycles) {
        const cycleIndex = Math.min(currentCycle, simParams.numCycles - 1);
        cycleData[cycleIndex].timePoints.push(timeInCycle);
        cycleData[cycleIndex].drugConcentrations.push(drugConc);
        cycleData[cycleIndex].inhibitorConcentrations.push(inhibitorConc);
        cycleData[cycleIndex].micValues.push(mic);
      }
    }

    const drugAUC = calculateAUC(timePoints, drugConcentrations);
    const inhibitorAUC = calculateAUC(timePoints, inhibitorConcentrations);

    const cycleResultsData = cycleData.map((cycle) => {
      const cycleDrugAUC = calculateAUC(cycle.timePoints, cycle.drugConcentrations);
      const cycleInhibitorAUC = calculateAUC(cycle.timePoints, cycle.inhibitorConcentrations);
      const cycleExposureRatio = cycleDrugAUC / cycleInhibitorAUC;
      const cycleTimeAboveMIC = cycle.timePoints.reduce((sum, _, index) => {
        return sum + (cycle.drugConcentrations[index] >= cycle.micValues[index] ? 1 : 0);
      }, 0);
      const cyclePercentTOverMIC = (cycleTimeAboveMIC / cycle.timePoints.length) * 100;

      return {
        ...cycle,
        drugAUC: cycleDrugAUC,
        inhibitorAUC: cycleInhibitorAUC,
        exposureRatio: cycleExposureRatio,
        percentTOverMIC: cyclePercentTOverMIC
      };
    });

    const exposureRatio = drugAUC / inhibitorAUC;
    const inverseExposureRatio = inhibitorAUC / drugAUC;
    const totalTimePoints = tOverMIC.length;
    const timeAboveMIC = tOverMIC.reduce((sum, val) => sum + val, 0);
    const percentTOverMIC = (timeAboveMIC / totalTimePoints) * 100;

    const chartData = timePoints.map((time, index) => ({
      time: parseFloat(time.toFixed(2)),
      drug: parseFloat(drugConcentrations[index].toFixed(3)),
      inhibitor: parseFloat(inhibitorConcentrations[index].toFixed(3)),
      mic: parseFloat(micValues[index].toFixed(3))
    }));

    const resultsData = {
      drugAUC: drugAUC.toFixed(2),
      inhibitorAUC: inhibitorAUC.toFixed(2),
      exposureRatio: exposureRatio.toFixed(3),
      inverseExposureRatio: inverseExposureRatio.toFixed(3),
      percentTOverMIC: percentTOverMIC.toFixed(1),
      drugMinConc: drugMinConc.toFixed(2),
      inhibitorMinConc: inhibitorMinConc.toFixed(2),
      kDrug: kDrug.toFixed(4),
      kInhibitor: kInhibitor.toFixed(4)
    };

    // SINGLE final race condition check before updating ANY state
    if (runId !== latestRunIdRef.current || !isMountedRef.current) {
      return; // Don't update any state if this run was cancelled or component unmounted
    }

    // Commit ALL state updates atomically if run is still valid
    setResults(resultsData);
    setChartData(chartData);
    setCycleResults(cycleResultsData);
    setIsSimulating(false);
  }, [drugParams, inhibitorParams, pdParams, simParams, calculateDecayConstant, calculateMinConcentration, concentrationDuringInfusion, concentrationDuringDecay, calculateLog2MIC, calculateAUC, validateDrugParams, validateInhibitorParams]);

  // Debounced simulation re-run when parameters change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      runSimulation();
    }, 500); // 500ms debounce to avoid excessive calculations during rapid parameter changes

    return () => clearTimeout(timeoutId);
  }, [drugParams, inhibitorParams, pdParams, simParams, runSimulation]);

  // Reset zoom when chart data changes
  useEffect(() => {
    setZoomDomain({});
    setRefAreaLeft(null);
    setRefAreaRight(null);
    setIsZooming(false);
  }, [chartData]);

  // Component unmount cleanup
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const interpretExposureRatio = (ratio: number) => {
    if (ratio > 2) {
      return "High drug exposure per inhibitor exposure - efficient interaction";
    } else if (ratio < 0.5) {
      return "Low drug exposure per inhibitor exposure - less potent or suboptimal dosing";
    } else {
      return "Moderate drug to inhibitor exposure ratio";
    }
  };

  const resetParameters = () => {
    setDrugParams({
      dosingInterval: 24,
      infusionTime: 1,
      halfLife: 6,
      maxConcentration: 100
    });
    setInhibitorParams({
      dosingInterval: 24,
      infusionTime: 1,
      halfLife: 8,
      maxConcentration: 50
    });
    setPdParams({
      log2MIC0: 2,
      imax: 3,
      ic50: 25,
      hillCoeff: 1
    });
    setSimParams({
      numCycles: 3,
      timeStep: 0.1
    });
  };

  // Zoom functionality for concentration chart
  const handleZoomMouseDown = (e: any) => {
    if (e && e.activeLabel !== undefined) {
      setRefAreaLeft(e.activeLabel);
      setIsZooming(true);
    }
  };

  const handleZoomMouseMove = (e: any) => {
    if (isZooming && e && e.activeLabel !== undefined) {
      setRefAreaRight(e.activeLabel);
    }
  };

  const handleZoomMouseUp = () => {
    if (refAreaLeft !== null && refAreaRight !== null) {
      const left = Math.min(refAreaLeft, refAreaRight);
      const right = Math.max(refAreaLeft, refAreaRight);
      
      // Minimum drag width validation - ignore drags less than 0.5 hours
      if (right - left < 0.5) {
        setRefAreaLeft(null);
        setRefAreaRight(null);
        setIsZooming(false);
        return;
      }
      
      // Calculate Y domain based on data in the selected range
      const dataInRange = chartData.filter(d => d.time >= left && d.time <= right);
      if (dataInRange.length > 0) {
        const allValues = dataInRange.flatMap(d => [d.drug, d.inhibitor, d.mic]);
        const top = Math.max(...allValues) * 1.1; // Add 10% padding
        const bottom = Math.min(...allValues) * 0.9; // Add 10% padding
        
        setZoomDomain({ left, right, top, bottom });
      }
    }
    
    setRefAreaLeft(null);
    setRefAreaRight(null);
    setIsZooming(false);
  };

  const handleZoomMouseLeave = () => {
    // Cancel zoom operation if mouse leaves chart area
    setRefAreaLeft(null);
    setRefAreaRight(null);
    setIsZooming(false);
  };

  const resetZoom = () => {
    setZoomDomain({});
    setRefAreaLeft(null);
    setRefAreaRight(null);
    setIsZooming(false);
  };

  // Dosing optimization function
  const calculateOptimization = useCallback(() => {
    if (!results || chartData.length === 0) return null;

    const currentInterval = drugParams.dosingInterval;
    const currentDose = drugParams.maxConcentration;
    const currentTOverMIC = parseFloat(results.percentTOverMIC);
    
    // Find peak and trough concentrations
    const peakConc = Math.max(...chartData.map(d => d.drug));
    const troughConc = Math.min(...chartData.map(d => d.drug));

    // Calculate optimization recommendations
    let recommendedInterval = currentInterval;
    let recommendedDose = currentDose;
    let confidence = 0.7;
    let riskAssessment = "Moderate";

    // Adjust dosing interval based on T>MIC target
    const tOverMICRatio = currentTOverMIC / optimizationTarget.targetTOverMIC;
    if (tOverMICRatio < 0.8) {
      // Need to increase T>MIC - reduce interval or increase dose
      if (peakConc < optimizationTarget.maxSafeConc * 0.8) {
        // Safe to increase dose
        recommendedDose = Math.min(currentDose * 1.3, optimizationTarget.maxSafeConc * 0.9);
        confidence = 0.85;
        riskAssessment = "Low";
      } else {
        // Reduce dosing interval instead
        recommendedInterval = Math.max(currentInterval * 0.75, 6);
        confidence = 0.75;
        riskAssessment = "Moderate";
      }
    } else if (tOverMICRatio > 1.2) {
      // T>MIC is higher than needed - can optimize for safety/convenience
      if (troughConc > optimizationTarget.minEffectiveConc * 1.5) {
        // Can extend interval
        recommendedInterval = Math.min(currentInterval * 1.25, 48);
        confidence = 0.8;
        riskAssessment = "Low";
      } else if (peakConc > optimizationTarget.maxSafeConc * 0.9) {
        // Reduce dose for safety
        recommendedDose = Math.max(currentDose * 0.85, optimizationTarget.minEffectiveConc * 2);
        confidence = 0.8;
        riskAssessment = "Low";
      }
    }

    // Safety checks
    if (troughConc < optimizationTarget.minEffectiveConc) {
      riskAssessment = "High - Risk of subtherapeutic levels";
      confidence = 0.6;
    }
    if (peakConc > optimizationTarget.maxSafeConc) {
      riskAssessment = "High - Risk of toxicity";
      confidence = 0.5;
    }

    // Calculate expected outcomes using proper pharmacokinetic formulas
    const kDrug = Math.log(2) / drugParams.halfLife; // decay constant
    
    // Calculate expected peak concentration (directly proportional to dose for IV infusion)
    const expectedPeakConc = recommendedDose;
    
    // Calculate expected trough concentration using exponential decay
    // At steady state: Ctrough = Cpeak * exp(-k * (interval - infusion_time))
    const expectedTroughConc = expectedPeakConc * Math.exp(-kDrug * (recommendedInterval - drugParams.infusionTime));
    
    // Estimate T>MIC more accurately by simulating key time points
    // This is a simplified estimation - assumes linear decay between peak and trough for MIC comparison
    let timeAboveMicEstimate = 0;
    const timeSteps = 10; // Sample 10 points during the dosing interval
    const avgMIC = chartData.length > 0 ? chartData.reduce((sum, d) => sum + d.mic, 0) / chartData.length : 4; // Use average MIC
    
    for (let i = 0; i <= timeSteps; i++) {
      const timeInInterval = (i / timeSteps) * recommendedInterval;
      let estimatedConc;
      
      if (timeInInterval <= drugParams.infusionTime) {
        // During infusion: linear increase from trough to peak
        estimatedConc = expectedTroughConc + (expectedPeakConc - expectedTroughConc) * (timeInInterval / drugParams.infusionTime);
      } else {
        // After infusion: exponential decay
        estimatedConc = expectedPeakConc * Math.exp(-kDrug * (timeInInterval - drugParams.infusionTime));
      }
      
      if (estimatedConc >= avgMIC) {
        timeAboveMicEstimate++;
      }
    }
    
    const expectedTOverMIC = Math.min((timeAboveMicEstimate / (timeSteps + 1)) * 100, 100);

    return {
      recommendedInterval: Math.round(recommendedInterval * 10) / 10,
      recommendedDose: Math.round(recommendedDose * 10) / 10,
      expectedTOverMIC: Math.round(expectedTOverMIC * 10) / 10,
      expectedPeakConc: Math.round(expectedPeakConc * 100) / 100,
      expectedTroughConc: Math.round(expectedTroughConc * 100) / 100,
      riskAssessment,
      confidence: Math.round(confidence * 100) / 100
    };
  }, [drugParams, optimizationTarget, results, chartData]);

  const validateOptimizationTargets = () => {
    const errors: string[] = [];
    
    if (optimizationTarget.minEffectiveConc <= 0) {
      errors.push("Minimum effective concentration must be positive");
    }
    if (optimizationTarget.maxSafeConc <= 0) {
      errors.push("Maximum safe concentration must be positive");
    }
    if (optimizationTarget.minEffectiveConc >= optimizationTarget.maxSafeConc) {
      errors.push("Minimum effective concentration must be less than maximum safe concentration");
    }
    if (optimizationTarget.targetTOverMIC <= 0 || optimizationTarget.targetTOverMIC > 100) {
      errors.push("Target T>MIC must be between 1% and 100%");
    }
    
    return errors;
  };

  const runOptimization = () => {
    // Check for parameter validation errors first
    const drugErrors = validateDrugParams();
    const inhibitorErrors = validateInhibitorParams();
    
    if (drugErrors.length > 0 || inhibitorErrors.length > 0) {
      setOptimizationErrors([
        ...drugErrors.map(err => `Drug: ${err}`),
        ...inhibitorErrors.map(err => `Inhibitor: ${err}`)
      ]);
      return;
    }
    
    const validationErrors = validateOptimizationTargets();
    if (validationErrors.length > 0) {
      setOptimizationErrors(validationErrors);
      return;
    }
    
    setOptimizationErrors([]);
    const optimization = calculateOptimization();
    setOptimizationResult(optimization);
    setShowOptimization(true);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <FlaskConical className="text-2xl" />
              <h1 className="text-xl font-bold">PKPD Simulator</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm opacity-90">Pharmacokinetics & Pharmacodynamics</span>
              <Button 
                className="bg-primary-foreground text-primary hover:bg-opacity-90" 
                onClick={() => exportCompleteResults(drugParams, inhibitorParams, pdParams, simParams, results, chartData, cycleResults)}
                disabled={!results}
                data-testid="button-export"
              >
                <Download className="w-4 h-4 mr-2" />
                Export Results
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Simulation Controls */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-8">
          {/* Drug Parameters Card */}
          <Card>
            <CardHeader className="bg-chart-1 text-white rounded-t-lg">
              <CardTitle className="flex items-center">
                <FlaskConical className="mr-2" />
                Drug Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {/* Drug Parameter Validation Errors */}
              {drugValidationErrors.length > 0 && (
                <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                  <h5 className="font-semibold text-destructive mb-2">Drug Parameter Errors:</h5>
                  <ul className="list-disc list-inside text-sm text-destructive space-y-1">
                    {drugValidationErrors.map((error, index) => (
                      <li key={index} data-testid={`drug-error-${index}`}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div>
                <Label htmlFor="drug-dosing-interval">Dosing Interval (hours)</Label>
                <Input
                  id="drug-dosing-interval"
                  type="number"
                  value={drugParams.dosingInterval}
                  onChange={(e) => setDrugParams({...drugParams, dosingInterval: e.target.value === "" ? drugParams.dosingInterval : Math.max(0.1, Number(e.target.value))})}
                  data-testid="input-drug-dosing-interval"
                />
              </div>
              <div>
                <Label htmlFor="drug-infusion-time">Infusion Time (hours)</Label>
                <Input
                  id="drug-infusion-time"
                  type="number"
                  step="0.1"
                  value={drugParams.infusionTime}
                  onChange={(e) => setDrugParams({...drugParams, infusionTime: e.target.value === "" ? drugParams.infusionTime : Math.max(0.1, Number(e.target.value))})}
                  data-testid="input-drug-infusion-time"
                />
              </div>
              <div>
                <Label htmlFor="drug-half-life">Half-Life (hours)</Label>
                <Input
                  id="drug-half-life"
                  type="number"
                  step="0.1"
                  value={drugParams.halfLife}
                  onChange={(e) => setDrugParams({...drugParams, halfLife: e.target.value === "" ? drugParams.halfLife : Math.max(0.1, Number(e.target.value))})}
                  data-testid="input-drug-half-life"
                />
              </div>
              <div>
                <Label htmlFor="drug-max-concentration">Max Concentration (μg/mL)</Label>
                <Input
                  id="drug-max-concentration"
                  type="number"
                  value={drugParams.maxConcentration}
                  onChange={(e) => setDrugParams({...drugParams, maxConcentration: e.target.value === "" ? drugParams.maxConcentration : Math.max(0.1, Number(e.target.value))})}
                  data-testid="input-drug-max-concentration"
                />
              </div>
            </CardContent>
          </Card>

          {/* Inhibitor Parameters Card */}
          <Card>
            <CardHeader className="bg-chart-2 text-white rounded-t-lg">
              <CardTitle className="flex items-center">
                <Ban className="mr-2" />
                Inhibitor Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {/* Inhibitor Parameter Validation Errors */}
              {inhibitorValidationErrors.length > 0 && (
                <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                  <h5 className="font-semibold text-destructive mb-2">Inhibitor Parameter Errors:</h5>
                  <ul className="list-disc list-inside text-sm text-destructive space-y-1">
                    {inhibitorValidationErrors.map((error, index) => (
                      <li key={index} data-testid={`inhibitor-error-${index}`}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div>
                <Label htmlFor="inhibitor-dosing-interval">Dosing Interval (hours)</Label>
                <Input
                  id="inhibitor-dosing-interval"
                  type="number"
                  value={inhibitorParams.dosingInterval}
                  onChange={(e) => setInhibitorParams({...inhibitorParams, dosingInterval: e.target.value === "" ? inhibitorParams.dosingInterval : Math.max(0.1, Number(e.target.value))})}
                  data-testid="input-inhibitor-dosing-interval"
                />
              </div>
              <div>
                <Label htmlFor="inhibitor-infusion-time">Infusion Time (hours)</Label>
                <Input
                  id="inhibitor-infusion-time"
                  type="number"
                  step="0.1"
                  value={inhibitorParams.infusionTime}
                  onChange={(e) => setInhibitorParams({...inhibitorParams, infusionTime: e.target.value === "" ? inhibitorParams.infusionTime : Math.max(0.1, Number(e.target.value))})}
                  data-testid="input-inhibitor-infusion-time"
                />
              </div>
              <div>
                <Label htmlFor="inhibitor-half-life">Half-Life (hours)</Label>
                <Input
                  id="inhibitor-half-life"
                  type="number"
                  step="0.1"
                  value={inhibitorParams.halfLife}
                  onChange={(e) => setInhibitorParams({...inhibitorParams, halfLife: e.target.value === "" ? inhibitorParams.halfLife : Math.max(0.1, Number(e.target.value))})}
                  data-testid="input-inhibitor-half-life"
                />
              </div>
              <div>
                <Label htmlFor="inhibitor-max-concentration">Max Concentration (μg/mL)</Label>
                <Input
                  id="inhibitor-max-concentration"
                  type="number"
                  value={inhibitorParams.maxConcentration}
                  onChange={(e) => setInhibitorParams({...inhibitorParams, maxConcentration: e.target.value === "" ? inhibitorParams.maxConcentration : Math.max(0.1, Number(e.target.value))})}
                  data-testid="input-inhibitor-max-concentration"
                />
              </div>
            </CardContent>
          </Card>

          {/* PD Parameters Card */}
          <Card>
            <CardHeader className="bg-chart-3 text-white rounded-t-lg">
              <CardTitle className="flex items-center">
                <TrendingUp className="mr-2" />
                PD Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div>
                <Label htmlFor="pd-log2mic0">Log₂ MIC₀</Label>
                <Input
                  id="pd-log2mic0"
                  type="number"
                  step="0.1"
                  value={pdParams.log2MIC0}
                  onChange={(e) => setPdParams({...pdParams, log2MIC0: e.target.value === "" ? pdParams.log2MIC0 : Number(e.target.value)})}
                  data-testid="input-pd-log2mic0"
                />
              </div>
              <div>
                <Label htmlFor="pd-imax">I<sub>max</sub></Label>
                <Input
                  id="pd-imax"
                  type="number"
                  step="0.1"
                  value={pdParams.imax}
                  onChange={(e) => setPdParams({...pdParams, imax: e.target.value === "" ? pdParams.imax : Math.max(0, Number(e.target.value))})}
                  data-testid="input-pd-imax"
                />
              </div>
              <div>
                <Label htmlFor="pd-ic50">IC₅₀ (μg/mL)</Label>
                <Input
                  id="pd-ic50"
                  type="number"
                  value={pdParams.ic50}
                  onChange={(e) => setPdParams({...pdParams, ic50: e.target.value === "" ? pdParams.ic50 : Math.max(0.1, Number(e.target.value))})}
                  data-testid="input-pd-ic50"
                />
              </div>
              <div>
                <Label htmlFor="pd-hill-coeff">Hill Coefficient</Label>
                <Input
                  id="pd-hill-coeff"
                  type="number"
                  step="0.1"
                  value={pdParams.hillCoeff}
                  onChange={(e) => setPdParams({...pdParams, hillCoeff: e.target.value === "" ? pdParams.hillCoeff : Math.max(0.1, Number(e.target.value))})}
                  data-testid="input-pd-hill-coeff"
                />
              </div>
            </CardContent>
          </Card>

          {/* Simulation Parameters Card */}
          <Card>
            <CardHeader className="bg-chart-4 text-foreground rounded-t-lg">
              <CardTitle className="flex items-center">
                <Settings className="mr-2" />
                Simulation Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div>
                <Label htmlFor="sim-num-cycles">Number of Cycles</Label>
                <Input
                  id="sim-num-cycles"
                  type="number"
                  min="1"
                  max="10"
                  value={simParams.numCycles}
                  onChange={(e) => setSimParams({...simParams, numCycles: e.target.value === "" ? simParams.numCycles : Math.max(1, Math.min(10, Number(e.target.value)))})}
                  data-testid="input-sim-num-cycles"
                />
              </div>
              <div>
                <Label htmlFor="sim-time-step">Time Step (hours)</Label>
                <Input
                  id="sim-time-step"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={simParams.timeStep}
                  onChange={(e) => setSimParams({...simParams, timeStep: e.target.value === "" ? simParams.timeStep : Math.max(0.01, Number(e.target.value))})}
                  data-testid="input-sim-time-step"
                />
              </div>
              <div className="pt-4">
                <Button
                  onClick={runSimulation}
                  disabled={isSimulating || drugValidationErrors.length > 0 || inhibitorValidationErrors.length > 0}
                  className="w-full"
                  data-testid="button-run-simulation"
                >
                  {isSimulating ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Running Simulation...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Run Simulation
                    </>
                  )}
                </Button>
              </div>
              <div className="pt-2">
                <Button
                  onClick={resetParameters}
                  variant="secondary"
                  className="w-full"
                  data-testid="button-reset-parameters"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset Parameters
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Dosing Optimization */}
        <div className="mb-8">
          <Card>
            <CardHeader className="bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-t-lg">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <Target className="mr-2" />
                  Dosing Optimization
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={runOptimization}
                  disabled={!results || chartData.length === 0 || drugValidationErrors.length > 0 || inhibitorValidationErrors.length > 0}
                  data-testid="button-run-optimization"
                >
                  <Target className="w-4 h-4 mr-1" />
                  Optimize Dosing
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Optimization Targets */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-lg">Optimization Targets</h4>
                  <div>
                    <Label htmlFor="opt-min-conc">Minimum Effective Concentration (μg/mL)</Label>
                    <Input
                      id="opt-min-conc"
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={optimizationTarget.minEffectiveConc}
                      onChange={(e) => {
                        const newValue = Math.max(0.1, Number(e.target.value) || 0.1);
                        setOptimizationTarget({...optimizationTarget, minEffectiveConc: newValue});
                        // Clear errors when user makes changes
                        if (optimizationErrors.length > 0) {
                          setOptimizationErrors([]);
                        }
                      }}
                      data-testid="input-opt-min-conc"
                    />
                  </div>
                  <div>
                    <Label htmlFor="opt-max-conc">Maximum Safe Concentration (μg/mL)</Label>
                    <Input
                      id="opt-max-conc"
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={optimizationTarget.maxSafeConc}
                      onChange={(e) => {
                        const newValue = Math.max(0.1, Number(e.target.value) || 0.1);
                        setOptimizationTarget({...optimizationTarget, maxSafeConc: newValue});
                        // Clear errors when user makes changes
                        if (optimizationErrors.length > 0) {
                          setOptimizationErrors([]);
                        }
                      }}
                      data-testid="input-opt-max-conc"
                    />
                  </div>
                  <div>
                    <Label htmlFor="opt-target-tmic">Target T&gt;MIC (%)</Label>
                    <Input
                      id="opt-target-tmic"
                      type="number"
                      step="1"
                      min="1"
                      max="100"
                      value={optimizationTarget.targetTOverMIC}
                      onChange={(e) => {
                        const newValue = Math.max(1, Math.min(100, Number(e.target.value) || 1));
                        setOptimizationTarget({...optimizationTarget, targetTOverMIC: newValue});
                        // Clear errors when user makes changes
                        if (optimizationErrors.length > 0) {
                          setOptimizationErrors([]);
                        }
                      }}
                      data-testid="input-opt-target-tmic"
                    />
                  </div>
                  
                  {/* Validation Errors */}
                  {optimizationErrors.length > 0 && (
                    <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                      <h5 className="font-semibold text-destructive mb-2">Validation Errors:</h5>
                      <ul className="list-disc list-inside text-sm text-destructive space-y-1">
                        {optimizationErrors.map((error, index) => (
                          <li key={index} data-testid={`error-${index}`}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Current Status */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-lg">Current Regimen</h4>
                  {results ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Dosing Interval:</span>
                        <span className="font-medium">{drugParams.dosingInterval}h</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Peak Concentration:</span>
                        <span className="font-medium">{chartData.length > 0 ? Math.max(...chartData.map(d => d.drug)).toFixed(2) : 'N/A'}μg/mL</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Trough Concentration:</span>
                        <span className="font-medium">{chartData.length > 0 ? Math.min(...chartData.map(d => d.drug)).toFixed(2) : 'N/A'}μg/mL</span>
                      </div>
                      <div className="flex justify-between">
                        <span>T&gt;MIC:</span>
                        <span className="font-medium">{results.percentTOverMIC}%</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Run simulation first to see current status</p>
                  )}
                </div>

                {/* Optimization Results */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-lg">Recommendations</h4>
                  {optimizationResult ? (
                    <div className="space-y-3">
                      <div className="p-4 bg-muted rounded-lg">
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>Recommended Interval:</span>
                            <span className="font-medium">{optimizationResult.recommendedInterval}h</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Recommended Dose:</span>
                            <span className="font-medium">{optimizationResult.recommendedDose}μg/mL</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Expected T&gt;MIC:</span>
                            <span className="font-medium">{optimizationResult.expectedTOverMIC}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Expected Peak:</span>
                            <span className="font-medium">{optimizationResult.expectedPeakConc}μg/mL</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Expected Trough:</span>
                            <span className="font-medium">{optimizationResult.expectedTroughConc}μg/mL</span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Risk Assessment:</span>
                          <span className={`text-xs px-2 py-1 rounded ${
                            optimizationResult.riskAssessment.includes('High') 
                              ? 'bg-red-100 text-red-800' 
                              : optimizationResult.riskAssessment.includes('Low')
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {optimizationResult.riskAssessment}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Confidence:</span>
                          <span className="text-sm font-medium">{Math.round(optimizationResult.confidence * 100)}%</span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={async () => {
                          setIsApplyingRecommendations(true);
                          
                          try {
                            // Apply the recommended parameters
                            const newDrugParams = {
                              ...drugParams,
                              dosingInterval: optimizationResult.recommendedInterval,
                              maxConcentration: optimizationResult.recommendedDose
                            };
                            
                            setDrugParams(newDrugParams);
                            
                            // Clear optimization state
                            setShowOptimization(false);
                            setOptimizationResult(null);
                            
                            // Give React a chance to update state, then trigger immediate simulation
                            await new Promise(resolve => setTimeout(resolve, 100));
                            await runSimulation();
                          } finally {
                            setIsApplyingRecommendations(false);
                          }
                        }}
                        disabled={isApplyingRecommendations}
                        data-testid="button-apply-optimization"
                      >
                        {isApplyingRecommendations ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Applying...
                          </>
                        ) : (
                          'Apply Recommendations'
                        )}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Click "Optimize Dosing" to get recommendations</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Chart Visualization */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
          {/* Main Concentration Chart */}
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <ChartArea className="mr-2 text-primary" />
                  Concentration vs Time Profile
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetZoom}
                    disabled={chartData.length === 0 || Object.keys(zoomDomain).length === 0}
                    data-testid="button-reset-zoom"
                  >
                    <ZoomOut className="w-4 h-4 mr-1" />
                    Reset Zoom
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportToCSV(chartData, 'pkpd-simulation-data.csv')}
                    disabled={chartData.length === 0}
                    data-testid="button-export-csv"
                  >
                    <FileText className="w-4 h-4 mr-1" />
                    CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportChartAsPNG('concentration-chart', 'concentration-vs-time-chart.png')}
                    disabled={chartData.length === 0}
                    data-testid="button-export-png"
                  >
                    <FileImage className="w-4 h-4 mr-1" />
                    PNG
                  </Button>
                </div>
              </CardTitle>
              <p className="text-sm text-muted-foreground">Drug, inhibitor, and MIC concentrations over time. Click and drag to zoom, or use reset zoom button.</p>
            </CardHeader>
            <CardContent className="p-6">
              {chartData.length === 0 && (
                <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                  No data to display. Click "Run Simulation" to generate chart.
                </div>
              )}
              <div id="concentration-chart">
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart 
                    data={chartData}
                    onMouseDown={handleZoomMouseDown}
                    onMouseMove={handleZoomMouseMove}
                    onMouseUp={handleZoomMouseUp}
                    onMouseLeave={handleZoomMouseLeave}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="time" 
                      domain={zoomDomain.left !== undefined && zoomDomain.right !== undefined ? [zoomDomain.left, zoomDomain.right] : ['dataMin', 'dataMax']}
                      allowDataOverflow={true}
                      label={{ value: 'Time (hours)', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis 
                      domain={zoomDomain.bottom !== undefined && zoomDomain.top !== undefined ? [zoomDomain.bottom, zoomDomain.top] : ['dataMin', 'dataMax']}
                      allowDataOverflow={true}
                      label={{ value: 'Concentration (μg/mL)', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip 
                      formatter={(value: number, name: string) => [`${value.toFixed(3)} μg/mL`, name]}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="drug" 
                      stroke="#3B82F6" 
                      strokeWidth={2}
                      name="Drug Concentration"
                      dot={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="inhibitor" 
                      stroke="#10B981" 
                      strokeWidth={2}
                      name="Inhibitor Concentration"
                      dot={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="mic" 
                      stroke="#F59E0B" 
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      name="MIC"
                      dot={false}
                    />
                    {refAreaLeft !== null && refAreaRight !== null && (
                      <ReferenceArea 
                        x1={refAreaLeft} 
                        x2={refAreaRight} 
                        strokeOpacity={0.3} 
                        fill="rgba(59, 130, 246, 0.1)" 
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Cycle Analysis Chart */}
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center">
                <RefreshCw className="mr-2 text-chart-2" />
                Cycle-by-Cycle Analysis
              </CardTitle>
              <p className="text-sm text-muted-foreground">AUC and exposure ratios per dosing cycle</p>
            </CardHeader>
            <CardContent className="p-6">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={cycleResults}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="cycle" 
                    label={{ value: 'Dosing Cycle', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxis 
                    label={{ value: 'AUC (μg⋅h/mL)', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip 
                    formatter={(value: number, name: string) => [`${value.toFixed(2)} μg⋅h/mL`, name]}
                  />
                  <Legend />
                  <Bar 
                    dataKey="drugAUC" 
                    fill="hsl(var(--chart-1))" 
                    name="Drug AUC"
                    opacity={0.8}
                  />
                  <Bar 
                    dataKey="inhibitorAUC" 
                    fill="hsl(var(--chart-2))" 
                    name="Inhibitor AUC"
                    opacity={0.8}
                  />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4">
                <Button
                  onClick={() => setShowAUCVisualization(true)}
                  className="bg-accent hover:bg-accent/90"
                  data-testid="button-detailed-auc"
                >
                  <Expand className="w-4 h-4 mr-2" />
                  Detailed AUC Analysis
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Results Panel */}
        {results && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Summary Results */}
            <Card>
              <CardHeader className="bg-gradient-to-r from-primary to-accent text-white rounded-t-lg">
                <CardTitle className="flex items-center">
                  <TrendingUp className="mr-2" />
                  Simulation Results
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-2xl font-bold text-primary" data-testid="text-drug-auc">{results.drugAUC}</div>
                    <div className="text-sm text-muted-foreground">Drug AUC (μg⋅h/mL)</div>
                  </div>
                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-2xl font-bold text-chart-2" data-testid="text-inhibitor-auc">{results.inhibitorAUC}</div>
                    <div className="text-sm text-muted-foreground">Inhibitor AUC (μg⋅h/mL)</div>
                  </div>
                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-2xl font-bold text-chart-3" data-testid="text-exposure-ratio">{results.exposureRatio}</div>
                    <div className="text-sm text-muted-foreground">Exposure Ratio (D/I)</div>
                  </div>
                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-2xl font-bold text-chart-4" data-testid="text-percent-tovermic">{results.percentTOverMIC}%</div>
                    <div className="text-sm text-muted-foreground">Time Above MIC</div>
                  </div>
                </div>
                <div className="mt-6 p-4 bg-secondary rounded-lg">
                  <h4 className="font-semibold text-secondary-foreground mb-2">Clinical Interpretation</h4>
                  <p className="text-sm text-secondary-foreground" data-testid="text-interpretation">
                    {interpretExposureRatio(parseFloat(results.exposureRatio))}. Efficacy profile suggests {parseFloat(results.percentTOverMIC) > 70 ? 'adequate' : 'suboptimal'} therapeutic window with {results.percentTOverMIC}% time above MIC threshold.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Pharmacokinetic Parameters */}
            <Card>
              <CardHeader className="bg-gradient-to-r from-chart-2 to-chart-3 text-white rounded-t-lg">
                <CardTitle className="flex items-center">
                  <FlaskConical className="mr-2" />
                  Pharmacokinetic Parameters
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-sm font-medium text-foreground">Drug Decay Constant (k)</span>
                  <span className="text-sm text-muted-foreground" data-testid="text-k-drug">{results.kDrug} h⁻¹</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-sm font-medium text-foreground">Inhibitor Decay Constant (k)</span>
                  <span className="text-sm text-muted-foreground" data-testid="text-k-inhibitor">{results.kInhibitor} h⁻¹</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-sm font-medium text-foreground">Drug Min Concentration</span>
                  <span className="text-sm text-muted-foreground" data-testid="text-drug-min-conc">{results.drugMinConc} μg/mL</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-sm font-medium text-foreground">Inhibitor Min Concentration</span>
                  <span className="text-sm text-muted-foreground" data-testid="text-inhibitor-min-conc">{results.inhibitorMinConc} μg/mL</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-sm font-medium text-foreground">Inverse Exposure Ratio (I/D)</span>
                  <span className="text-sm text-muted-foreground" data-testid="text-inverse-exposure-ratio">{results.inverseExposureRatio}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Cycle Results Table */}
        {cycleResults.length > 0 && (
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center">
                <Table className="mr-2 text-chart-3" />
                Detailed Cycle Analysis
              </CardTitle>
              <p className="text-sm text-muted-foreground">Individual cycle metrics and pharmacokinetic parameters</p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Cycle</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Drug AUC</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Inhibitor AUC</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Exposure Ratio</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">% T {'>'} MIC</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-background divide-y divide-border">
                    {cycleResults.map((cycle) => (
                      <tr key={cycle.cycle} className="hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground" data-testid={`text-cycle-${cycle.cycle}`}>{cycle.cycle}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground" data-testid={`text-cycle-drug-auc-${cycle.cycle}`}>{cycle.drugAUC.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground" data-testid={`text-cycle-inhibitor-auc-${cycle.cycle}`}>{cycle.inhibitorAUC.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground" data-testid={`text-cycle-exposure-ratio-${cycle.cycle}`}>{cycle.exposureRatio.toFixed(3)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-chart-2 text-white" data-testid={`text-cycle-percent-tovermic-${cycle.cycle}`}>
                            {cycle.percentTOverMIC.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button 
                            onClick={() => {
                              setSelectedCycle(cycle.cycle - 1);
                              setShowAUCVisualization(true);
                            }}
                            className="text-primary hover:text-accent font-medium"
                            data-testid={`button-view-details-${cycle.cycle}`}
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* AUC Modal */}
      <Modal
        isOpen={showAUCVisualization}
        onClose={() => setShowAUCVisualization(false)}
        title={`AUC Visualization - Cycle ${cycleResults[selectedCycle]?.cycle || 1}`}
      >
        {cycleResults.length > 0 && (
          <div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              {/* Cycle Selector */}
              <div className="bg-muted rounded-lg p-4">
                <h3 className="font-semibold text-foreground mb-3">Select Cycle</h3>
                <div className="flex flex-wrap gap-2">
                  {cycleResults.map((cycle) => (
                    <Button
                      key={cycle.cycle}
                      onClick={() => setSelectedCycle(cycle.cycle - 1)}
                      variant={selectedCycle === cycle.cycle - 1 ? "default" : "secondary"}
                      size="sm"
                      data-testid={`button-select-cycle-${cycle.cycle}`}
                    >
                      Cycle {cycle.cycle}
                    </Button>
                  ))}
                </div>
              </div>
              
              {/* Cycle Metrics */}
              <div className="bg-muted rounded-lg p-4">
                <h3 className="font-semibold text-foreground mb-3">Cycle Metrics</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Drug AUC:</span>
                    <span className="font-medium" data-testid="text-selected-cycle-drug-auc">{cycleResults[selectedCycle]?.drugAUC.toFixed(2)} μg⋅h/mL</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Inhibitor AUC:</span>
                    <span className="font-medium" data-testid="text-selected-cycle-inhibitor-auc">{cycleResults[selectedCycle]?.inhibitorAUC.toFixed(2)} μg⋅h/mL</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Exposure Ratio:</span>
                    <span className="font-medium" data-testid="text-selected-cycle-exposure-ratio">{cycleResults[selectedCycle]?.exposureRatio.toFixed(3)}</span>
                  </div>
                </div>
              </div>
              
              {/* Efficacy Metrics */}
              <div className="bg-muted rounded-lg p-4">
                <h3 className="font-semibold text-foreground mb-3">Efficacy Metrics</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>% T {'>'} MIC:</span>
                    <span className="font-medium text-chart-2" data-testid="text-selected-cycle-percent-tovermic">{cycleResults[selectedCycle]?.percentTOverMIC.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Avg MIC:</span>
                    <span className="font-medium">{((cycleResults[selectedCycle]?.micValues.reduce((a, b) => a + b, 0) || 0) / (cycleResults[selectedCycle]?.micValues.length || 1)).toFixed(2)} μg/mL</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Peak/Trough:</span>
                    <span className="font-medium">{((Math.max(...(cycleResults[selectedCycle]?.drugConcentrations || [])) / Math.min(...(cycleResults[selectedCycle]?.drugConcentrations || []))) || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Detailed AUC Chart */}
            <div className="bg-background border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
                <ChartArea className="mr-2" />
                AUC Area Under Curve Visualization
              </h3>
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart 
                  data={cycleResults[selectedCycle]?.timePoints.map((time, index) => ({
                    time: time.toFixed(1),
                    drug: cycleResults[selectedCycle]?.drugConcentrations[index],
                    inhibitor: cycleResults[selectedCycle]?.inhibitorConcentrations[index],
                    mic: cycleResults[selectedCycle]?.micValues[index]
                  })) || []}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="time" 
                    label={{ value: 'Time (hours)', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxis 
                    label={{ value: 'Concentration (μg/mL)', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip 
                    formatter={(value: number, name: string) => [`${value.toFixed(3)} μg/mL`, name]}
                  />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="drug" 
                    stroke="hsl(var(--chart-1))" 
                    fill="hsl(var(--chart-1))"
                    fillOpacity={0.3}
                    name="Drug Concentration"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="inhibitor" 
                    stroke="hsl(var(--chart-2))" 
                    fill="hsl(var(--chart-2))"
                    fillOpacity={0.3}
                    name="Inhibitor Concentration"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="mic" 
                    stroke="hsl(var(--chart-3))" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name="MIC"
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            
            {/* AUC Calculation Details */}
            <div className="mt-6 bg-background border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">AUC Calculation Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-foreground mb-2">Numerical Integration</h4>
                  <div className="text-sm space-y-1 text-muted-foreground">
                    <p>Method: Trapezoidal Rule</p>
                    <p>Time Step: {simParams.timeStep} hours</p>
                    <p>Integration Points: {cycleResults[selectedCycle]?.timePoints.length}</p>
                    <p>Cycle Duration: {drugParams.dosingInterval} hours</p>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground mb-2">Concentration Profile</h4>
                  <div className="text-sm space-y-1 text-muted-foreground">
                    <p>C<sub>max</sub>: {drugParams.maxConcentration.toFixed(1)} μg/mL</p>
                    <p>C<sub>min</sub>: {results?.drugMinConc} μg/mL</p>
                    <p>T<sub>max</sub>: {drugParams.infusionTime.toFixed(1)} hours</p>
                    <p>Clearance: {(0.693 * drugParams.halfLife).toFixed(3)} L/h</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PKPDSimulator;
