from flask import Flask, request, jsonify
import gspread
from oauth2client.service_account import ServiceAccountCredentials
import os

app = Flask(__name__)

# Authenticate with Google Sheets
scope = ['https://spreadsheets.google.com/feeds',
         'https://www.googleapis.com/auth/drive']
creds = ServiceAccountCredentials.from_json_keyfile_name('credentials.json', scope)
client = gspread.authorize(creds)

# Open your sheet
SHEET_NAME = 'WCUL Machine Status'
sheet = client.open(SHEET_NAME).sheet1

@app.route('/webhook', methods=['POST'])
def webhook():
    data = request.json
    print("Webhook received:", data)

    # Example format (adjust if needed)
    machine_name = data.get('machine_name')  # e.g., "QHC-PC"
    new_status = data.get('status')          # "Online" or "Offline"

    if not machine_name or not new_status:
        return jsonify({'error': 'Missing machine_name or status'}), 400

    try:
        # Get all values in column A (machine names)
        machine_column = sheet.col_values(1)
        for i, name in enumerate(machine_column):
            if name.strip() == machine_name:
                # Update status in column C
                sheet.update_cell(i + 1, 3, new_status)
                return jsonify({'message': f'Status for {machine_name} updated to {new_status}'}), 200
        return jsonify({'error': 'Machine name not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/')
def home():
    return 'Webhook running.'

if __name__ == '__main__':
    app.run(debug=True)
