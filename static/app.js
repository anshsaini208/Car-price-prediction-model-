// State variables
let state = {
    Present_Price: 10.0,
    Kms_Driven: 35000,
    Car_Age: 4,
    Fuel_Type: 'Petrol',
    Transmission: 'Manual',
    Seller_Type: 'Dealer',
    Owner: 0,
    lastPredictedPrice: 0
};

// Charts references
let depreciationChart = null;
let marketComparisonChart = null;

// DOM Elements
const elements = {
    presentPriceSlider: document.getElementById('presentPrice'),
    presentPriceVal: document.getElementById('presentPriceVal'),
    kmsDrivenSlider: document.getElementById('kmsDriven'),
    kmsDrivenVal: document.getElementById('kmsDrivenVal'),
    kmsDrivenNum: document.getElementById('kmsDrivenNum'),
    carAgeSlider: document.getElementById('carAge'),
    carAgeVal: document.getElementById('carAgeVal'),
    predictBtn: document.getElementById('predictBtn'),
    predictionForm: document.getElementById('predictionForm'),
    
    // Output elements
    predictedPrice: document.getElementById('predictedPrice'),
    predictedLakhs: document.getElementById('predictedLakhs'),
    statusTag: document.getElementById('statusTag'),
    retentionProgress: document.getElementById('retentionProgress'),
    retentionValue: document.getElementById('retentionValue'),
    metricOrigPrice: document.getElementById('metricOrigPrice'),
    metricDepr: document.getElementById('metricDepr'),
    metricRate: document.getElementById('metricRate'),
    
    // Stat bar elements
    statTotalCars: document.getElementById('statTotalCars'),
    statAvgPrice: document.getElementById('statAvgPrice'),
    statAvgKms: document.getElementById('statAvgKms')
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initSliders();
    initChips();
    fetchStatsAndInitCharts();
    
    // Submit handler (fallback or explicit trigger)
    elements.predictionForm.addEventListener('submit', (e) => {
        e.preventDefault();
        getPrediction();
    });
    
    // Initial prediction after a small delay
    setTimeout(getPrediction, 500);
});

// Setup Slider sync and visual updates
function initSliders() {
    // Present Price
    elements.presentPriceSlider.addEventListener('input', (e) => {
        state.Present_Price = parseFloat(e.target.value);
        elements.presentPriceVal.textContent = state.Present_Price.toFixed(1);
        debouncedPredict();
    });

    // Kms Driven (Sync Range and Number Inputs)
    elements.kmsDrivenSlider.addEventListener('input', (e) => {
        state.Kms_Driven = parseInt(e.target.value);
        elements.kmsDrivenVal.textContent = state.Kms_Driven.toLocaleString();
        elements.kmsDrivenNum.value = state.Kms_Driven;
        debouncedPredict();
    });

    elements.kmsDrivenNum.addEventListener('input', (e) => {
        let val = parseInt(e.target.value);
        if (isNaN(val) || val < 100) val = 100;
        if (val > 1000000) val = 1000000;
        
        state.Kms_Driven = val;
        elements.kmsDrivenVal.textContent = val.toLocaleString();
        
        // Sync slider (cap visual at max range)
        elements.kmsDrivenSlider.value = Math.min(val, parseInt(elements.kmsDrivenSlider.max));
        debouncedPredict();
    });

    // Car Age
    elements.carAgeSlider.addEventListener('input', (e) => {
        state.Car_Age = parseInt(e.target.value);
        elements.carAgeVal.textContent = state.Car_Age;
        debouncedPredict();
    });
}

// Setup Chips selection logic
function initChips() {
    const chipGroups = document.querySelectorAll('.chip-group');
    chipGroups.forEach(group => {
        const inputName = group.getAttribute('data-input-name');
        const chips = group.querySelectorAll('.chip');
        
        chips.forEach(chip => {
            chip.addEventListener('click', () => {
                // Remove active from peers
                chips.forEach(c => c.classList.remove('active'));
                
                // Add active to clicked
                chip.classList.add('active');
                
                // Update state
                let rawValue = chip.getAttribute('data-value');
                // Convert numeric states to int
                if (inputName === 'Owner') {
                    state[inputName] = parseInt(rawValue);
                } else {
                    state[inputName] = rawValue;
                }
                
                getPrediction();
            });
        });
    });
}

// Debounce helper to prevent flooding backend on slider drag
let predictTimeout = null;
function debouncedPredict() {
    if (predictTimeout) clearTimeout(predictTimeout);
    predictTimeout = setTimeout(getPrediction, 80);
}

// Fetch prediction from API
async function getPrediction() {
    try {
        elements.statusTag.textContent = "Calculating...";
        elements.statusTag.className = "result-status-tag";
        
        const response = await fetch('/api/predict', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(state)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Update UI with results
        animatePrice(result.predicted_price_lakhs);
        animateRetentionGauge(result.retention_rate_percentage);
        
        // Update Stats fields
        elements.metricOrigPrice.textContent = `₹${(state.Present_Price * 100000).toLocaleString('en-IN')}`;
        const deprValue = Math.max(0, state.Present_Price - result.predicted_price_lakhs);
        elements.metricDepr.textContent = `₹${(deprValue * 100000).toLocaleString('en-IN')}`;
        
        // Depreciation rating label
        let rating = "Low";
        const lossRate = 100 - result.retention_rate_percentage;
        if (lossRate > 50) {
            rating = "High ⚠️";
            elements.metricRate.style.color = "var(--danger-color)";
        } else if (lossRate > 25) {
            rating = "Medium";
            elements.metricRate.style.color = "var(--warning-color)";
        } else {
            rating = "Low ✨";
            elements.metricRate.style.color = "var(--success-color)";
        }
        elements.metricRate.textContent = `${rating} (${(lossRate / (state.Car_Age || 1)).toFixed(1)}%/yr)`;

        elements.statusTag.textContent = "Valued";
        elements.statusTag.className = "result-status-tag success";
        
        // Update chart dot
        updateChartPredictionDot(state.Car_Age, result.predicted_price_lakhs);
        
    } catch (error) {
        console.error("Prediction failed:", error);
        elements.statusTag.textContent = "Error";
        elements.statusTag.className = "result-status-tag error";
        elements.predictedPrice.textContent = "₹ N/A";
        elements.predictedLakhs.textContent = "---";
    }
}

// Animate Price Output Count-Up
function animatePrice(targetPriceLakhs) {
    const targetInRupees = Math.round(targetPriceLakhs * 100000);
    const startInRupees = Math.round(state.lastPredictedPrice * 100000);
    
    // Animate Rupees Value
    const duration = 400; // ms
    const startTime = performance.now();
    
    function update(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease out quadratic
        const easeProgress = progress * (2 - progress);
        const currentRupees = Math.round(startInRupees + (targetInRupees - startInRupees) * easeProgress);
        const currentLakhs = (startInRupees / 100000) + ((targetPriceLakhs - (startInRupees / 100000)) * easeProgress);
        
        elements.predictedPrice.textContent = `₹${currentRupees.toLocaleString('en-IN')}`;
        elements.predictedLakhs.textContent = currentLakhs.toFixed(2);
        
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            state.lastPredictedPrice = targetPriceLakhs;
        }
    }
    
    requestAnimationFrame(update);
}

// Animate SVG circular progress bar
function animateRetentionGauge(percentage) {
    // The path length of a circle of radius 15.9155 is exactly 100
    elements.retentionProgress.setAttribute('stroke-dasharray', `${percentage}, 100`);
    
    // Change color based on value retention
    if (percentage > 70) {
        elements.retentionProgress.style.stroke = "var(--success-color)";
    } else if (percentage > 45) {
        elements.retentionProgress.style.stroke = "var(--warning-color)";
    } else {
        elements.retentionProgress.style.stroke = "var(--danger-color)";
    }
    
    // Animate percentage text
    let current = 0;
    if (elements.retentionValue.textContent !== '--') {
        current = parseFloat(elements.retentionValue.textContent);
    }
    
    const diff = percentage - current;
    const steps = 20;
    let step = 0;
    
    const interval = setInterval(() => {
        step++;
        const val = current + (diff * (step / steps));
        elements.retentionValue.textContent = `${val.toFixed(1)}%`;
        if (step >= steps) {
            clearInterval(interval);
            elements.retentionValue.textContent = `${percentage.toFixed(1)}%`;
        }
    }, 15);
}

// Fetch stats on load and initialize Chart.js widgets
async function fetchStatsAndInitCharts() {
    try {
        const response = await fetch('/api/stats');
        if (!response.ok) throw new Error("Could not load dataset stats.");
        
        const stats = await response.json();
        
        // Populate Header Stats
        elements.statTotalCars.textContent = stats.summary.total_cars.toLocaleString();
        elements.statAvgPrice.textContent = `₹${(stats.summary.avg_selling_price * 100000).toLocaleString('en-IN', {maximumFractionDigits:0})}`;
        elements.statAvgKms.textContent = `${Math.round(stats.summary.avg_kms_driven).toLocaleString()} km`;
        
        // Setup Depreciation Line Chart
        initDepreciationChart(stats.depreciation);
        
        // Setup Comparison Bar Chart
        initComparisonChart(stats.fuel_stats, stats.transmission_stats);
        
    } catch (err) {
        console.error("Error setting up charts/stats:", err);
    }
}

// Draw Depreciation Line Curve
function initDepreciationChart(deprData) {
    const ctx = document.getElementById('depreciationChart').getContext('2d');
    
    const ages = deprData.map(d => d.Car_Age);
    const avgPrices = deprData.map(d => d.Selling_Price);
    
    depreciationChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ages,
            datasets: [
                {
                    label: 'Market Avg Resale Value (Lakhs)',
                    data: avgPrices,
                    borderColor: 'rgba(100, 80, 255, 0.8)',
                    backgroundColor: 'rgba(100, 80, 255, 0.05)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: 'rgba(100, 80, 255, 1)'
                },
                {
                    label: 'Your Estimate',
                    data: [], // Filled dynamically
                    borderColor: 'var(--accent-cyan)',
                    backgroundColor: 'rgba(0, 240, 255, 0.3)',
                    borderWidth: 0,
                    pointRadius: 10,
                    pointHoverRadius: 12,
                    pointBackgroundColor: 'var(--accent-cyan)',
                    pointBorderWidth: 4,
                    pointBorderColor: '#ffffff',
                    showLine: false,
                    shadowColor: 'var(--accent-cyan-glow)',
                    shadowBlur: 15
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // We use custom legends in HTML
                },
                tooltip: {
                    backgroundColor: 'rgba(16, 22, 38, 0.95)',
                    titleFont: { family: 'Plus Jakarta Sans', size: 13, weight: 'bold' },
                    bodyFont: { family: 'Plus Jakarta Sans', size: 12 },
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    displayColors: true,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            return ` ${context.dataset.label}: ${context.raw.toFixed(2)} Lakhs`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Age of Vehicle (Years)',
                        color: 'rgba(255,255,255,0.5)',
                        font: { family: 'Plus Jakarta Sans', size: 11, weight: 600 }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.03)'
                    },
                    ticks: {
                        color: 'rgba(255,255,255,0.6)',
                        font: { family: 'Plus Jakarta Sans' }
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Price (Lakhs)',
                        color: 'rgba(255,255,255,0.5)',
                        font: { family: 'Plus Jakarta Sans', size: 11, weight: 600 }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.03)'
                    },
                    ticks: {
                        color: 'rgba(255,255,255,0.6)',
                        font: { family: 'Plus Jakarta Sans' },
                        callback: function(value) { return '₹' + value + 'L'; }
                    }
                }
            }
        }
    });
}

// Draw comparison bar chart (Fuel and Transmission average prices)
function initComparisonChart(fuelData, transData) {
    const ctx = document.getElementById('marketComparisonChart').getContext('2d');
    
    // Combine fuel and transmission data for visualization
    const labels = [
        ...fuelData.map(f => `${f.Fuel_Type} Fuel`),
        ...transData.map(t => `${t.Transmission} Gear`)
    ];
    
    const prices = [
        ...fuelData.map(f => f.avg_price),
        ...transData.map(t => t.avg_price)
    ];
    
    const colors = [
        ...fuelData.map((f, i) => `hsla(${190 + i * 20}, 90%, 55%, 0.7)`),
        ...transData.map((t, i) => `hsla(${270 + i * 30}, 85%, 55%, 0.7)`)
    ];

    const borderColors = [
        ...fuelData.map((f, i) => `hsl(${190 + i * 20}, 90%, 55%)`),
        ...transData.map((t, i) => `hsl(${270 + i * 30}, 85%, 55%)`)
    ];

    marketComparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: prices,
                backgroundColor: colors,
                borderColor: borderColors,
                borderWidth: 1.5,
                borderRadius: 8,
                barThickness: 28
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(16, 22, 38, 0.95)',
                    bodyFont: { family: 'Plus Jakarta Sans', size: 12 },
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            return ` Avg Resale Value: ₹${(context.raw * 100000).toLocaleString('en-IN', {maximumFractionDigits:0})}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: 'rgba(255,255,255,0.6)',
                        font: { family: 'Plus Jakarta Sans', size: 10, weight: 600 }
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Avg Price (Lakhs)',
                        color: 'rgba(255,255,255,0.5)',
                        font: { family: 'Plus Jakarta Sans', size: 10, weight: 600 }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.03)'
                    },
                    ticks: {
                        color: 'rgba(255,255,255,0.6)',
                        font: { family: 'Plus Jakarta Sans' },
                        callback: function(value) { return '₹' + value + 'L'; }
                    }
                }
            }
        }
    });
}

// Update the glowing estimate point on the line chart
function updateChartPredictionDot(age, predictedPrice) {
    if (!depreciationChart) return;
    
    // Create an array matching the exact X positions (ages)
    // The line chart has labels based on sorted unique ages in the dataset (e.g. 0, 1, 2, ... 14, 15)
    const labels = depreciationChart.data.labels;
    const dotData = new Array(labels.length).fill(null);
    
    // Find closest index for the user's age
    let closestIndex = labels.indexOf(age);
    if (closestIndex === -1) {
        // Find nearest matching index
        let minDiff = Infinity;
        for (let i = 0; i < labels.length; i++) {
            let diff = Math.abs(labels[i] - age);
            if (diff < minDiff) {
                minDiff = diff;
                closestIndex = i;
            }
        }
    }
    
    if (closestIndex !== -1) {
        dotData[closestIndex] = predictedPrice;
    }
    
    depreciationChart.data.datasets[1].data = dotData;
    depreciationChart.update('none'); // Update without full recalculation transition for speed
}
