import React, { useState, useRef, useEffect } from 'react';
import { Search, Download, AlertCircle, Clock, Users, Building2, Globe, User, Loader2 } from 'lucide-react';

const API_BASE_URL = 'http://localhost:8000'; // Change this to your deployed backend URL

const OwnershipVisualizer = () => {
  const [companyName, setCompanyName] = useState('');
  const [ownershipData, setOwnershipData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const mermaidRef = useRef(null);

  const getNodeColor = (type) => {
    switch (type) {
      case 'uk_company': return '#3B82F6'; // Blue for UK companies
      case 'non_uk_company': return '#EF4444'; // Red for non-UK companies
      case 'individual': return '#10B981'; // Green for individuals
      default: return '#6B7280'; // Gray for unknown
    }
  };

  const getNodeIcon = (type) => {
    switch (type) {
      case 'uk_company': return <Building2 className="w-4 h-4" />;
      case 'non_uk_company': return <Globe className="w-4 h-4" />;
      case 'individual': return <User className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  const generateMermaidDiagram = (node, parentId = null, nodeMap = new Map()) => {
    // Create unique ID for this node
    const nodeId = `node_${nodeMap.size}`;
    nodeMap.set(node.id, nodeId);

    let diagram = '';
    
    // Add node definition with styling
    const nodeName = node.name.replace(/['"]/g, '').substring(0, 30);
    const nodeColor = getNodeColor(node.type);
    
    diagram += `    ${nodeId}["${nodeName}"]:::${node.type}\n`;
    
    // Add connection to parent if exists
    if (parentId) {
      diagram += `    ${parentId} --> ${nodeId}\n`;
    }

    // Process children
    for (const child of node.children) {
      diagram += generateMermaidDiagram(child, nodeId, nodeMap);
    }

    return diagram;
  };

  const createFullMermaidDiagram = (ownershipData) => {
    let diagram = 'graph TD\n';
    diagram += generateMermaidDiagram(ownershipData.root_company);
    
    // Add styling classes
    diagram += `
    classDef uk_company fill:${getNodeColor('uk_company')},stroke:#333,stroke-width:2px,color:#fff
    classDef non_uk_company fill:${getNodeColor('non_uk_company')},stroke:#333,stroke-width:2px,color:#fff
    classDef individual fill:${getNodeColor('individual')},stroke:#333,stroke-width:2px,color:#fff
    `;
    
    return diagram;
  };

  const renderMermaidDiagram = async (diagramCode) => {
    if (mermaidRef.current) {
      try {
        // Clear previous diagram
        mermaidRef.current.innerHTML = '';
        
        // Import mermaid dynamically
        const mermaid = (await import('https://cdn.skypack.dev/mermaid@10.6.1')).default;
        
        mermaid.initialize({ 
          startOnLoad: false,
          theme: 'default',
          flowchart: {
            useMaxWidth: true,
            htmlLabels: true
          }
        });
        
        const { svg } = await mermaid.render('ownership-diagram', diagramCode);
        mermaidRef.current.innerHTML = svg;
      } catch (err) {
        console.error('Error rendering Mermaid diagram:', err);
        mermaidRef.current.innerHTML = '<p class="text-red-500">Error rendering diagram</p>';
      }
    }
  };

  const searchOwnership = async () => {
    if (!companyName.trim()) {
      setError('Please enter a company name');
      return;
    }

    setLoading(true);
    setError('');
    setOwnershipData(null);
    setStats(null);

    try {
      const response = await fetch(`${API_BASE_URL}/ownership-structure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ company_name: companyName }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch ownership data');
      }

      const data = await response.json();
      setOwnershipData(data);
      setStats({
        totalNodes: data.total_nodes,
        processingTime: data.processing_time,
        errors: data.errors
      });

      // Render the diagram
      const diagramCode = createFullMermaidDiagram(data);
      await renderMermaidDiagram(diagramCode);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = async () => {
    if (!mermaidRef.current) return;

    try {
      // Create a new window for PDF generation
      const printWindow = window.open('', '_blank');
      const diagramHTML = mermaidRef.current.outerHTML;
      
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Ownership Structure - ${ownershipData?.root_company?.name}</title>
          <style>
            body { margin: 20px; font-family: Arial, sans-serif; }
            .header { margin-bottom: 20px; }
            .diagram { text-align: center; }
            .legend { margin-top: 20px; display: flex; gap: 20px; justify-content: center; }
            .legend-item { display: flex; align-items: center; gap: 5px; }
            .legend-color { width: 20px; height: 20px; border-radius: 3px; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Ownership Structure</h1>
            <h2>${ownershipData?.root_company?.name}</h2>
            <p>Generated on: ${new Date().toLocaleDateString()}</p>
            ${stats ? `<p>Total entities: ${stats.totalNodes} | Processing time: ${stats.processingTime.toFixed(2)}s</p>` : ''}
          </div>
          <div class="diagram">${diagramHTML}</div>
          <div class="legend">
            <div class="legend-item">
              <div class="legend-color" style="background-color: ${getNodeColor('uk_company')}"></div>
              <span>UK Companies</span>
            </div>
            <div class="legend-item">
              <div class="legend-color" style="background-color: ${getNodeColor('non_uk_company')}"></div>
              <span>Non-UK Companies</span>
            </div>
            <div class="legend-item">
              <div class="legend-color" style="background-color: ${getNodeColor('individual')}"></div>
              <span>Individuals</span>
            </div>
          </div>
        </body>
        </html>
      `);
      
      printWindow.document.close();
      
      // Wait for content to load, then print
      setTimeout(() => {
        printWindow.print();
      }, 1000);
      
    } catch (err) {
      console.error('Error exporting to PDF:', err);
      alert('Failed to export PDF. Please try again.');
    }
  };

  const renderNodeTree = (node, depth = 0) => {
    return (
      <div key={node.id} className={`ml-${depth * 4} mb-2`}>
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
          <div style={{ color: getNodeColor(node.type) }}>
            {getNodeIcon(node.type)}
          </div>
          <div className="flex-1">
            <div className="font-medium">{node.name}</div>
            {node.company_number && (
              <div className="text-xs text-gray-500">Company No: {node.company_number}</div>
            )}
            {node.country_of_residence && (
              <div className="text-xs text-gray-500">Country: {node.country_of_residence}</div>
            )}
            {node.nature_of_control.length > 0 && (
              <div className="text-xs text-blue-600">
                Control: {node.nature_of_control.join(', ')}
              </div>
            )}
            {node.error && (
              <div className="text-xs text-red-500">Error: {node.error}</div>
            )}
          </div>
        </div>
        {node.children.map(child => renderNodeTree(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            UK Company Ownership Structure Analyzer
          </h1>
          <p className="text-gray-600 mb-6">
            Enter a UK company name to explore its complete ownership structure through the Companies House API
          </p>
          
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && searchOwnership()}
                placeholder="Enter company name (e.g., 'Tesco PLC')"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
            </div>
            <button
              onClick={searchOwnership}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Analyze
                </>
              )}
            </button>
          </div>

          {/* Legend */}
          <div className="flex gap-6 mb-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: getNodeColor('uk_company') }}></div>
              <span>UK Companies</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: getNodeColor('non_uk_company') }}></div>
              <span>Non-UK Companies</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: getNodeColor('individual') }}></div>
              <span>Individuals</span>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 text-red-800">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">Error</span>
              </div>
              <p className="text-red-700 mt-1">{error}</p>
            </div>
          )}

          {stats && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>Total Entities: <strong>{stats.totalNodes}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span>Processing: <strong>{stats.processingTime.toFixed(2)}s</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-600" />
                  <span>Errors: <strong>{stats.errors.length}</strong></span>
                </div>
                <button
                  onClick={exportToPDF}
                  className="flex items-center gap-2 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  <Download className="w-4 h-4" />
                  Export PDF
                </button>
              </div>
              {stats.errors.length > 0 && (
                <div className="mt-2 text-sm text-orange-700">
                  <details>
                    <summary className="cursor-pointer">View Errors ({stats.errors.length})</summary>
                    <ul className="mt-2 list-disc list-inside">
                      {stats.errors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Visualization Area */}
        {ownershipData && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Tree Diagram */}
            <div className="xl:col-span-2">
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-bold mb-4">Ownership Structure Diagram</h2>
                <div 
                  ref={mermaidRef}
                  className="border rounded-lg p-4 min-h-96 overflow-auto"
                  style={{ backgroundColor: '#fafafa' }}
                >
                  {loading && (
                    <div className="flex items-center justify-center h-96">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tree List View */}
            <div className="xl:col-span-1">
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-bold mb-4">Detailed Structure</h2>
                <div className="max-h-96 overflow-y-auto">
                  {renderNodeTree(ownershipData.root_company)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OwnershipVisualizer;
