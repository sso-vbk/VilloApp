<?php
/**
 * VilloApp API Backend - Version Corrigée
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
    // URL API mise à jour - nouvelle API OpenData Brussels
    $apiUrl = "https://opendata.brussels.be/api/explore/v2.1/catalog/datasets/bike-sharing-availability/records?limit=100&refine=type%3A%22Station%22";
    
    // Alternative fallback API URLs
    $fallbackUrls = [
        "https://bruxellesdata.opendatasoft.com/api/explore/v2.1/catalog/datasets/stations-villo-bruxelles-rbc/records?limit=343",
        "https://opendata.brussels.be/api/records/1.0/search/?dataset=villo-stations-availability-real-time&rows=300"
    ];
    
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
        CURLOPT_USERAGENT => 'VilloApp/1.0 (Brussels Bike Sharing)',
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            'Accept-Language: fr,nl,en'
        ]
    ]);
    
    // Execute cURL request
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    
    // If main API fails, try fallback URLs
    if ($error || $httpCode !== 200) {
        foreach ($fallbackUrls as $fallbackUrl) {
            curl_setopt($ch, CURLOPT_URL, $fallbackUrl);
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $error = curl_error($ch);
            
            if (!$error && $httpCode === 200) {
                break;
            }
        }
    }
    
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
    
    // Normalize data structure based on API response format
    $normalizedData = normalizeApiResponse($data);
    
    // Return successful response
    return [
        'success' => true,
        'error' => null,
        'data' => $normalizedData,
        'timestamp' => date('Y-m-d H:i:s'),
        'total_results' => isset($normalizedData['results']) ? count($normalizedData['results']) : 0
    ];
}

// Function to normalize different API response formats
function normalizeApiResponse($data) {
    // Check if this is the new OpenData Brussels format
    if (isset($data['results']) && is_array($data['results'])) {
        // New format - already normalized
        return $data;
    }
    
    // Check if this is the old format with 'records'
    if (isset($data['records']) && is_array($data['records'])) {
        // Old format - convert to new format
        $normalizedResults = [];
        
        foreach ($data['records'] as $record) {
            $fields = $record['fields'] ?? [];
            
            // Map old field names to new format
            $normalizedRecord = [
                'id' => $fields['number'] ?? $fields['id'] ?? uniqid(),
                'name_nl' => $fields['name'] ?? $fields['nom'] ?? '',
                'name_fr' => $fields['nom'] ?? $fields['name'] ?? '',
                'address_nl' => $fields['address'] ?? $fields['adresse'] ?? '',
                'address_fr' => $fields['adresse'] ?? $fields['address'] ?? '',
                'available_bikes' => intval($fields['available_bikes'] ?? $fields['available_bike'] ?? 0),
                'available_bike_stands' => intval($fields['available_bike_stands'] ?? $fields['available_stands'] ?? 0),
                'bike_stands' => intval($fields['bike_stands'] ?? $fields['stands'] ?? 0),
                'latitude' => floatval($fields['latitude'] ?? $fields['lat'] ?? 0),
                'longitude' => floatval($fields['longitude'] ?? $fields['lng'] ?? $fields['lon'] ?? 0),
                'status' => $fields['status'] ?? 'OPEN',
                'last_update' => $fields['last_update'] ?? date('Y-m-d H:i:s')
            ];
            
            // Handle geo_point_2d format if present
            if (isset($fields['geo_point_2d'])) {
                if (is_array($fields['geo_point_2d'])) {
                    $normalizedRecord['latitude'] = floatval($fields['geo_point_2d']['lat'] ?? $fields['geo_point_2d'][0] ?? 0);
                    $normalizedRecord['longitude'] = floatval($fields['geo_point_2d']['lon'] ?? $fields['geo_point_2d'][1] ?? 0);
                }
            }
            
            $normalizedResults[] = $normalizedRecord;
        }
        
        return [
            'results' => $normalizedResults,
            'total_count' => count($normalizedResults)
        ];
    }
    
    // Unknown format - return as is
    return $data;
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
                'timestamp' => date('Y-m-d H:i:s'),
                'php_version' => PHP_VERSION,
                'curl_available' => function_exists('curl_init')
            ]);
            break;
            
        case 'test':
            // Test endpoint for debugging
            $testResult = fetchVilloStations();
            echo json_encode([
                'success' => true,
                'test_result' => $testResult,
                'server_info' => [
                    'php_version' => PHP_VERSION,
                    'curl_version' => curl_version(),
                    'timezone' => date_default_timezone_get()
                ]
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
        'available_actions' => ['getStations', 'health', 'test'],
        'usage' => 'Call with ?action=getStations to fetch station data'
    ]);
}
?>