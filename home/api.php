<?php
/**
 * VilloApp API Backend
 * This file handles all API calls to bypass CORS restrictions
 */

// Enable error reporting for debugging (disable in production)
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Set headers for JSON response and CORS
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Function to fetch Villo stations data
function fetchVilloStations() {
    // Main API URL
    $apiUrl = "https://bruxellesdata.opendatasoft.com/api/explore/v2.1/catalog/datasets/stations-villo-bruxelles-rbc/records?limit=343";
    
    // Initialize cURL session
    $ch = curl_init();
    
    // Set cURL options
    curl_setopt_array($ch, [
        CURLOPT_URL => $apiUrl,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => false,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_USERAGENT => 'VilloApp/1.0',
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
    ]);
    
    // Execute cURL request
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    
    // Close cURL session
    curl_close($ch);
    
    // Check for cURL errors
    if ($error) {
        return [
            'success' => false,
            'error' => 'CURL Error: ' . $error,
            'data' => null
        ];
    }
    
    // Check HTTP status code
    if ($httpCode !== 200) {
        return [
            'success' => false,
            'error' => 'API returned HTTP code: ' . $httpCode,
            'data' => null
        ];
    }
    
    // Parse JSON response
    $data = json_decode($response, true);
    
    // Check for JSON parsing errors
    if (json_last_error() !== JSON_ERROR_NONE) {
        return [
            'success' => false,
            'error' => 'JSON parsing error: ' . json_last_error_msg(),
            'data' => null
        ];
    }
    
    // Return successful response
    return [
        'success' => true,
        'error' => null,
        'data' => $data,
        'timestamp' => date('Y-m-d H:i:s'),
        'total_results' => isset($data['results']) ? count($data['results']) : 0
    ];
}

// Handle GET request for stations
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action'])) {
    $action = $_GET['action'];
    
    switch ($action) {
        case 'getStations':
            // Fetch stations data
            $result = fetchVilloStations();
            
            // Set appropriate HTTP status code
            if ($result['success']) {
                http_response_code(200);
            } else {
                http_response_code(500);
            }
            
            // Output JSON response
            echo json_encode($result);
            break;
            
        case 'health':
            // Health check endpoint
            echo json_encode([
                'success' => true,
                'message' => 'API is running',
                'timestamp' => date('Y-m-d H:i:s')
            ]);
            break;
            
        default:
            // Invalid action
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'Invalid action specified'
            ]);
            break;
    }
} else {
    // No action specified or wrong method
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'No action specified or invalid request method',
        'available_actions' => ['getStations', 'health']
    ]);
}
?>