import os
import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# Initialize FastAPI app
app = FastAPI(
    title="Car Price Prediction API",
    description="Backend API for predicting car resale value and providing dataset statistics",
    version="1.0.0"
)

# Enable CORS for local testing/development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
MODEL_PATH = os.path.join('models', 'car_price_model.pkl')
METADATA_PATH = os.path.join('models', 'metadata.pkl')
DATA_PATH = os.path.join('data', 'car_data.csv')

# Load model pipeline on startup
if not os.path.exists(MODEL_PATH) or not os.path.exists(METADATA_PATH):
    raise RuntimeError("Model files not found. Run train.py first.")

model = joblib.load(MODEL_PATH)
metadata = joblib.load(METADATA_PATH)

# Load dataset for live stats
if os.path.exists(DATA_PATH):
    df_data = pd.read_csv(DATA_PATH)
    df_data['Car_Age'] = 2026 - df_data['Year']
else:
    df_data = None

# Input validation model
class CarPredictionInput(BaseModel):
    Present_Price: float = Field(..., description="Ex-showroom price of the car in Lakhs", ge=0.1, le=100.0)
    Kms_Driven: int = Field(..., description="Total kilometers driven", ge=100, le=1000000)
    Fuel_Type: str = Field(..., description="Fuel type: Petrol, Diesel, or CNG")
    Seller_Type: str = Field(..., description="Seller Type: Dealer or Individual")
    Transmission: str = Field(..., description="Transmission: Manual or Automatic")
    Owner: int = Field(..., description="Number of previous owners", ge=0, le=4)
    Car_Age: int = Field(..., description="Age of the car in years", ge=0, le=30)

@app.post("/api/predict")
def predict_price(input_data: CarPredictionInput):
    try:
        # Validate categorical values
        if input_data.Fuel_Type not in ['Petrol', 'Diesel', 'CNG']:
            raise HTTPException(status_code=400, detail="Fuel_Type must be Petrol, Diesel, or CNG")
        if input_data.Seller_Type not in ['Dealer', 'Individual']:
            raise HTTPException(status_code=400, detail="Seller_Type must be Dealer or Individual")
        if input_data.Transmission not in ['Manual', 'Automatic']:
            raise HTTPException(status_code=400, detail="Transmission must be Manual or Automatic")
        
        # Prepare DataFrame for scikit-learn pipeline
        features_df = pd.DataFrame([{
            'Present_Price': input_data.Present_Price,
            'Kms_Driven': input_data.Kms_Driven,
            'Fuel_Type': input_data.Fuel_Type,
            'Seller_Type': input_data.Seller_Type,
            'Transmission': input_data.Transmission,
            'Owner': input_data.Owner,
            'Car_Age': input_data.Car_Age
        }])
        
        # Make prediction
        predicted_price = model.predict(features_df)[0]
        
        # Post-processing: Resale price cannot be negative, and usually doesn't exceed the present showroom price
        predicted_price = max(0.01, predicted_price)
        predicted_price = min(input_data.Present_Price, predicted_price)
        
        # Calculate retention rate
        retention_percentage = (predicted_price / input_data.Present_Price) * 100
        
        return {
            "predicted_price_lakhs": round(predicted_price, 2),
            "predicted_price_formatted": f"₹{round(predicted_price * 100000):,}",
            "retention_rate_percentage": round(retention_percentage, 1)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")

@app.get("/api/stats")
def get_stats():
    if df_data is None:
        raise HTTPException(status_code=404, detail="Dataset not found to compute stats.")
        
    try:
        # 1. Summary Metrics
        summary = {
            "total_cars": int(df_data.shape[0]),
            "avg_selling_price": float(round(df_data['Selling_Price'].mean(), 2)),
            "avg_present_price": float(round(df_data['Present_Price'].mean(), 2)),
            "avg_kms_driven": float(round(df_data['Kms_Driven'].mean(), 0)),
            "max_kms_driven": int(df_data['Kms_Driven'].max()),
            "max_present_price": float(df_data['Present_Price'].max())
        }
        
        # 2. Depreciation stats (Age vs Avg Selling Price)
        depreciation = df_data.groupby('Car_Age')['Selling_Price'].mean().reset_index()
        depreciation['Selling_Price'] = depreciation['Selling_Price'].round(2)
        depreciation_list = depreciation.sort_values('Car_Age').to_dict(orient='records')
        
        # 3. Fuel Type Stats
        fuel_stats = df_data.groupby('Fuel_Type').agg(
            avg_price=('Selling_Price', 'mean'),
            count=('Selling_Price', 'count')
        ).reset_index()
        fuel_stats['avg_price'] = fuel_stats['avg_price'].round(2)
        fuel_stats_list = fuel_stats.to_dict(orient='records')
        
        # 4. Transmission Stats
        trans_stats = df_data.groupby('Transmission').agg(
            avg_price=('Selling_Price', 'mean'),
            count=('Selling_Price', 'count')
        ).reset_index()
        trans_stats['avg_price'] = trans_stats['avg_price'].round(2)
        trans_stats_list = trans_stats.to_dict(orient='records')

        # 5. Scatter plot data (subset of 150 records to prevent bloating response)
        scatter_sample = df_data[['Kms_Driven', 'Selling_Price', 'Car_Age']].sample(
            n=min(150, len(df_data)), random_state=42
        ).to_dict(orient='records')
        
        return {
            "summary": summary,
            "depreciation": depreciation_list,
            "fuel_stats": fuel_stats_list,
            "transmission_stats": trans_stats_list,
            "scatter_data": scatter_sample,
            "metadata": {
                "numeric_bounds": metadata['numeric_bounds'],
                "categories": metadata['categories']
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stats computation error: {str(e)}")

# Create static directory if it does not exist
os.makedirs('static', exist_ok=True)

# Mount the static directory for Serving UI at root
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
