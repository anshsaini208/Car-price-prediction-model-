import os
import urllib.request
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error, r2_score, mean_absolute_error
import joblib

# Ensure directories exist
os.makedirs('data', exist_ok=True)
os.makedirs('models', exist_ok=True)

# 1. Download Dataset
DATA_URL = "https://raw.githubusercontent.com/sumit0072/Car-Price-Prediction-Project/master/car%20data.csv"
DATA_PATH = os.path.join('data', 'car_data.csv')

print("Downloading dataset...")
urllib.request.urlretrieve(DATA_URL, DATA_PATH)
print(f"Dataset saved to {DATA_PATH}")

# Load dataset
df = pd.read_csv(DATA_PATH)
print("\nDataset Info:")
print(df.info())
print("\nDataset Head:")
print(df.head())

# 2. Feature Engineering
# Calculate Car_Age based on the current year 2026
df['Car_Age'] = 2026 - df['Year']

# Define features and target
# We drop Car_Name as it has too many unique values for a simple prediction inputs, 
# and Year since we now use Car_Age.
X = df.drop(columns=['Car_Name', 'Year', 'Selling_Price'])
y = df['Selling_Price']

print("\nFeatures used for training:")
print(X.columns.tolist())
print("\nTarget:")
print("Selling_Price (in Lakhs)")

# Identify numerical and categorical columns
numeric_features = ['Present_Price', 'Kms_Driven', 'Owner', 'Car_Age']
categorical_features = ['Fuel_Type', 'Seller_Type', 'Transmission']

# 3. Preprocessing Pipeline
preprocessor = ColumnTransformer(
    transformers=[
        ('num', StandardScaler(), numeric_features),
        ('cat', OneHotEncoder(drop='first', handle_unknown='ignore'), categorical_features)
    ]
)

# 4. Model Definition (Random Forest Regressor)
model_pipeline = Pipeline(steps=[
    ('preprocessor', preprocessor),
    ('regressor', RandomForestRegressor(n_estimators=100, random_state=42, max_depth=10))
])

# Split the data
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

print(f"\nTraining set size: {X_train.shape[0]}")
print(f"Testing set size: {X_test.shape[0]}")

# 5. Train Model
print("\nTraining Random Forest Regressor...")
model_pipeline.fit(X_train, y_train)
print("Training complete!")

# 6. Evaluation
y_pred = model_pipeline.predict(X_test)
mse = mean_squared_error(y_test, y_pred)
mae = mean_absolute_error(y_test, y_pred)
r2 = r2_score(y_test, y_pred)

print(f"\nModel Performance Metrics:")
print(f"Mean Absolute Error (MAE): {mae:.3f} Lakhs")
print(f"Mean Squared Error (MSE): {mse:.3f}")
print(f"R-squared (R2) Score: {r2:.3f}")

# 7. Save Model and Pipeline
model_save_path = os.path.join('models', 'car_price_model.pkl')
joblib.dump(model_pipeline, model_save_path)
print(f"\nModel pipeline saved successfully to {model_save_path}")

# Save feature metadata for the API validation
metadata = {
    'numeric_features': numeric_features,
    'categorical_features': categorical_features,
    'categories': {
        col: df[col].unique().tolist() for col in categorical_features
    },
    'numeric_bounds': {
        col: {
            'min': float(df[col].min()),
            'max': float(df[col].max()),
            'mean': float(df[col].mean())
        } for col in numeric_features
    }
}
metadata_save_path = os.path.join('models', 'metadata.pkl')
joblib.dump(metadata, metadata_save_path)
print(f"Feature metadata saved successfully to {metadata_save_path}")
