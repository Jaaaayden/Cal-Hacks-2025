from flask import Flask, request, jsonify
from flask import send_from_directory
from flask_cors import CORS
import os

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

@app.route('/')
def index():
    return app.send_static_file('index.html')

# serve other static files (script.js, style.css, etc.)
@app.route('/<path:path>')
def static_files(path):
    return app.send_static_file(path)

# simple API endpoint to receive the submitted word
@app.route('/api/word', methods=['POST'])
def receive_word():
    data = request.get_json(silent=True) or {}
    word = (data.get('word') or '').strip()
    if not word:
        return jsonify({'error': 'no word provided'}), 400

    # TODO: replace with real processing (generate tree, DB, etc.)
    response = {
        'word': word,
        'status': 'received',
        'message': f'Got "{word}" on the backend'
    }
    return jsonify(response), 200

if __name__ == '__main__':
    # Run on localhost:8000
    app.run(host='127.0.0.1', port=8000, debug=True)    