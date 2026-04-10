import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';

// --- Types ---

interface RegulationNodeData {
  label: string;
  title: string;
  jenis: string;
  status: string;
  slug: string;
  collection: 'inti' | 'pendukung';
  nodeType: 'regulation';
  side?: 'left' | 'right';
}

interface CategoryNodeData {
  label: string;
  count: number;
  categoryId: string;
  nodeType: 'category';
  side?: 'left' | 'right';
}

interface RootNodeData {
  label: string;
  nodeType: 'root';
  side?: 'center';
}

type MindMapNodeData = RegulationNodeData | CategoryNodeData | RootNodeData;

// --- Side classification: pendukung = LEFT, inti = RIGHT ---

function isLeftNode(nodeId: string): boolean {
  return nodeId.startsWith('cat-pend-') || nodeId.startsWith('reg-pend-');
}

function getNodeSide(nodeId: string, data: MindMapNodeData, hierEdges: Edge[]): 'left' | 'right' {
  if (data.nodeType === 'root') return 'right';
  if (isLeftNode(nodeId)) return 'left';
  if (data.nodeType === 'regulation') {
    const parentEdge = hierEdges.find((e) => e.target === nodeId && e.source.startsWith('cat-'));
    if (parentEdge) return isLeftNode(parentEdge.source) ? 'left' : 'right';
  }
  return 'right';
}

// --- Status colors (diubah differs: orange for inti, blue for pendukung) ---

const statusBorderInti: Record<string, string> = {
  berlaku: '#16a34a',
  dicabut: '#dc2626',
  diubah: '#d97706',
};

const statusBorderPendukung: Record<string, string> = {
  berlaku: '#16a34a',
  dicabut: '#dc2626',
  diubah: '#2563eb',
};

const statusBgInti: Record<string, string> = {
  berlaku: '#f0fdf4',
  dicabut: '#fef2f2',
  diubah: '#fffbeb',
};

const statusBgPendukung: Record<string, string> = {
  berlaku: '#f0fdf4',
  dicabut: '#fef2f2',
  diubah: '#eff6ff',
};

const statusBgDarkInti: Record<string, string> = {
  berlaku: '#052e16',
  dicabut: '#450a0a',
  diubah: '#451a03',
};

const statusBgDarkPendukung: Record<string, string> = {
  berlaku: '#052e16',
  dicabut: '#450a0a',
  diubah: '#172554',
};

// --- Node sizes ---

const NODE_SIZES = {
  root: { width: 400, height: 80 },
  category: { width: 240, height: 60 },
  regulation: { width: 240, height: 90 },
};

function getNodeSize(nodeType: string) {
  return NODE_SIZES[nodeType as keyof typeof NODE_SIZES] || NODE_SIZES.regulation;
}

// --- Bidirectional dagre layout ---

function getLayoutedElements(
  nodes: Node<MindMapNodeData>[],
  edges: Edge[],
): { nodes: Node<MindMapNodeData>[]; edges: Edge[] } {
  const rootNode = nodes.find((n) => n.data.nodeType === 'root');
  if (!rootNode) return { nodes, edges: [] };

  const nodeSet = new Set(nodes.map((n) => n.id));
  const visibleEdges = edges.filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target));

  const hierEdges = visibleEdges.filter(
    (e) => e.source === rootNode.id || e.source.startsWith('cat-'),
  );

  const leftNodeIds = new Set<string>([rootNode.id]);
  const rightNodeIds = new Set<string>([rootNode.id]);

  for (const node of nodes) {
    if (node.id === rootNode.id) continue;
    const side = getNodeSide(node.id, node.data, hierEdges);
    if (side === 'left') leftNodeIds.add(node.id);
    else rightNodeIds.add(node.id);
  }

  // Dagre RL for left (pendukung)
  const gLeft = new dagre.graphlib.Graph();
  gLeft.setDefaultEdgeLabel(() => ({}));
  gLeft.setGraph({ rankdir: 'RL', nodesep: 60, ranksep: 220, marginx: 60, marginy: 60 });

  for (const node of nodes) {
    if (!leftNodeIds.has(node.id)) continue;
    const size = getNodeSize(node.data.nodeType);
    gLeft.setNode(node.id, { width: size.width, height: size.height });
  }
  for (const edge of hierEdges) {
    if (leftNodeIds.has(edge.source) && leftNodeIds.has(edge.target)) {
      gLeft.setEdge(edge.source, edge.target);
    }
  }
  if (gLeft.nodeCount() > 1) dagre.layout(gLeft);

  // Dagre LR for right (inti)
  const gRight = new dagre.graphlib.Graph();
  gRight.setDefaultEdgeLabel(() => ({}));
  gRight.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 220, marginx: 60, marginy: 60 });

  for (const node of nodes) {
    if (!rightNodeIds.has(node.id)) continue;
    const size = getNodeSize(node.data.nodeType);
    gRight.setNode(node.id, { width: size.width, height: size.height });
  }
  for (const edge of hierEdges) {
    if (rightNodeIds.has(edge.source) && rightNodeIds.has(edge.target)) {
      gRight.setEdge(edge.source, edge.target);
    }
  }
  if (gRight.nodeCount() > 1) dagre.layout(gRight);

  const rootLeftPos = gLeft.node(rootNode.id) || { x: 0, y: 0 };
  const rootRightPos = gRight.node(rootNode.id) || { x: 0, y: 0 };

  const positions = new Map<string, { x: number; y: number }>();
  positions.set(rootNode.id, { x: 0, y: 0 });

  for (const node of nodes) {
    if (node.id === rootNode.id) continue;
    if (leftNodeIds.has(node.id) && gLeft.node(node.id)) {
      const pos = gLeft.node(node.id);
      positions.set(node.id, { x: pos.x - rootLeftPos.x, y: pos.y - rootLeftPos.y });
    } else if (rightNodeIds.has(node.id) && gRight.node(node.id)) {
      const pos = gRight.node(node.id);
      positions.set(node.id, { x: pos.x - rootRightPos.x, y: pos.y - rootRightPos.y });
    }
  }

  const layoutedNodes = nodes.map((node) => {
    const pos = positions.get(node.id) || { x: 0, y: 0 };
    const size = getNodeSize(node.data.nodeType);
    const side = node.id === rootNode.id ? 'center' : leftNodeIds.has(node.id) ? 'left' : 'right';
    return {
      ...node,
      data: { ...node.data, side } as MindMapNodeData,
      position: { x: pos.x - size.width / 2, y: pos.y - size.height / 2 },
    };
  });

  const updatedEdges = visibleEdges.map((e) => {
    if (e.source === rootNode.id) {
      const isLeft = leftNodeIds.has(e.target);
      return { ...e, sourceHandle: isLeft ? 'source-left' : 'source-right', targetHandle: isLeft ? 'target-right' : 'target-left' };
    }
    if (e.source.startsWith('cat-')) {
      const isLeft = leftNodeIds.has(e.source);
      return { ...e, sourceHandle: isLeft ? 'source-left' : 'source-right', targetHandle: isLeft ? 'target-right' : 'target-left' };
    }
    return e;
  });

  return { nodes: layoutedNodes, edges: updatedEdges };
}

// --- Custom Nodes ---

function RootNode({ data }: NodeProps<Node<RootNodeData>>) {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const handleStyle = { background: isDark ? '#000000' : '#ffffff' };
  return (
    <div style={{ background: isDark ? '#ffffff' : '#000000', color: isDark ? '#000000' : '#ffffff', padding: '16px 24px', fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 700, fontSize: 15, textAlign: 'center', minWidth: NODE_SIZES.root.width, border: `2px solid ${isDark ? '#ffffff' : '#000000'}` }}>
      <Handle type="source" position={Position.Left} id="source-left" style={handleStyle} />
      {data.label}
      <Handle type="source" position={Position.Right} id="source-right" style={handleStyle} />
    </div>
  );
}

function CategoryNode({ data }: NodeProps<Node<CategoryNodeData>>) {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const side = (data as CategoryNodeData & { side?: string }).side || 'right';
  const handleColor = isDark ? '#a3a3a3' : '#525252';
  return (
    <div style={{ background: isDark ? '#e5e5e5' : '#262626', color: isDark ? '#000000' : '#ffffff', padding: '12px 20px', fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 700, fontSize: 14, textAlign: 'center', minWidth: NODE_SIZES.category.width, border: `2px solid ${isDark ? '#d4d4d4' : '#525252'}`, cursor: 'pointer' }}>
      <Handle type="target" position={side === 'left' ? Position.Right : Position.Left} id={side === 'left' ? 'target-right' : 'target-left'} style={{ background: handleColor }} />
      <div>{data.label}</div>
      <div style={{ fontSize: 11, color: isDark ? '#525252' : '#a3a3a3', marginTop: 4, fontWeight: 400 }}>{data.count} peraturan, klik untuk expand</div>
      <Handle type="source" position={side === 'left' ? Position.Left : Position.Right} id={side === 'left' ? 'source-left' : 'source-right'} style={{ background: handleColor }} />
    </div>
  );
}

function RegulationNode({ data }: NodeProps<Node<RegulationNodeData>>) {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const side = (data as RegulationNodeData & { side?: string }).side || 'right';
  const isInti = data.collection === 'inti';

  const borderMap = isInti ? statusBorderInti : statusBorderPendukung;
  const bgMap = isDark ? (isInti ? statusBgDarkInti : statusBgDarkPendukung) : (isInti ? statusBgInti : statusBgPendukung);

  const borderColor = borderMap[data.status] || '#94a3b8';
  const bgColor = bgMap[data.status] || (isDark ? '#1e293b' : '#f8fafc');

  const href = isInti
    ? `/peraturan-inti/${data.slug}`
    : `/peraturan-pendukung/${data.jenis.toLowerCase()}/${data.slug}`;

  return (
    <div
      style={{ background: bgColor, border: `2px solid ${borderColor}`, borderLeftWidth: side === 'right' ? 5 : 2, borderRightWidth: side === 'left' ? 5 : 2, padding: '10px 14px', minWidth: NODE_SIZES.regulation.width, maxWidth: 280, cursor: 'pointer' }}
      onClick={() => { window.location.href = href; }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') window.location.href = href; }}
    >
      <Handle type="target" position={side === 'left' ? Position.Right : Position.Left} id={side === 'left' ? 'target-right' : 'target-left'} style={{ background: borderColor }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'monospace', padding: '1px 5px', background: '#262626', color: '#fff' }}>{data.jenis}</span>
        <span style={{ fontSize: 10, fontWeight: 500, textTransform: 'capitalize', color: borderColor }}>{data.status}</span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 13, fontFamily: 'monospace', color: isDark ? '#f5f5f5' : '#171717' }}>{data.label}</div>
      <div style={{ fontSize: 11, color: isDark ? '#a3a3a3' : '#525252', marginTop: 4, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        {data.title.length > 50 ? data.title.slice(0, 50) + '\u2026' : data.title}
      </div>
      <Handle type="source" position={side === 'left' ? Position.Left : Position.Right} id={side === 'left' ? 'source-left' : 'source-right'} style={{ background: borderColor }} />
    </div>
  );
}

const nodeTypes = { root: RootNode, category: CategoryNode, regulation: RegulationNode };

// --- Inner component ---

function MindMapInner({ allNodes, allEdges }: { allNodes: Node<MindMapNodeData>[]; allEdges: Edge[] }) {
  const { fitView } = useReactFlow();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { visibleNodes, visibleEdges } = useMemo(() => {
    const filtered = allNodes.filter((node) => {
      if (node.data.nodeType === 'root') return true;
      if (node.data.nodeType === 'category') {
        const parentEdge = allEdges.find((e) => e.target === node.id);
        if (!parentEdge) return true;
        if (parentEdge.source === 'root') return true;
        // Era sub-category: parent is a category, show only if parent expanded
        const parentCatId = parentEdge.source.replace('cat-pend-', '').replace('cat-inti-', '');
        return expanded.has(parentCatId);
      }
      // Regulation: show if parent category expanded
      const parentEdge = allEdges.find((e) => e.target === node.id && e.source.startsWith('cat-'));
      if (!parentEdge) return false;
      const catId = parentEdge.source.replace('cat-pend-', '').replace('cat-inti-', '');
      return expanded.has(catId);
    });
    return { visibleNodes: filtered, visibleEdges: allEdges };
  }, [allNodes, allEdges, expanded]);

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => getLayoutedElements(visibleNodes, visibleEdges),
    [visibleNodes, visibleEdges],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  const prevLayout = useMemo(() => JSON.stringify(layoutedNodes.map((n) => n.id)), [layoutedNodes]);
  useMemo(() => {
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
    setTimeout(() => fitView({ padding: 0.3, duration: 300 }), 50);
  }, [prevLayout]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node<MindMapNodeData>) => {
    if (node.data.nodeType === 'category') {
      const catData = node.data as CategoryNodeData;
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(catData.categoryId)) next.delete(catData.categoryId);
        else next.add(catData.categoryId);
        return next;
      });
    }
  }, []);

  const expandAll = useCallback(() => {
    const allCatIds = allNodes
      .filter((n) => n.data.nodeType === 'category')
      .map((n) => (n.data as CategoryNodeData).categoryId);
    setExpanded(new Set(allCatIds));
  }, [allNodes]);

  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
      minZoom={0.05}
      maxZoom={2}
      attributionPosition="bottom-left"
    >
      <Background gap={20} size={1} />
      <Controls />
      <MiniMap
        nodeColor={(n) => {
          const d = n.data as MindMapNodeData;
          if (d.nodeType === 'root') return '#000000';
          if (d.nodeType === 'category') return '#404040';
          const rd = d as RegulationNodeData;
          const borderMap = rd.collection === 'inti' ? statusBorderInti : statusBorderPendukung;
          return borderMap[rd.status] || '#a3a3a3';
        }}
        maskColor="rgba(0,0,0,0.08)"
      />
      <Panel position="top-right">
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={expandAll} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: '#ffffff', color: '#171717', border: 'none', cursor: 'pointer' }}>Tampilkan Semua</button>
          <button onClick={collapseAll} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: '#262626', color: '#fff', border: '1px solid #525252', cursor: 'pointer' }}>Sembunyikan Semua</button>
        </div>
      </Panel>
    </ReactFlow>
  );
}

// --- Main: reads data from DOM script tags ---

export default function MindMapSeluruhnya() {
  const { allNodes, allEdges } = useMemo(() => {
    const nodesEl = document.getElementById('mindmap-all-nodes');
    const edgesEl = document.getElementById('mindmap-all-edges');
    if (!nodesEl || !edgesEl) return { allNodes: [], allEdges: [] };
    try {
      return {
        allNodes: JSON.parse(nodesEl.textContent || '[]') as Node<MindMapNodeData>[],
        allEdges: JSON.parse(edgesEl.textContent || '[]') as Edge[],
      };
    } catch {
      return { allNodes: [], allEdges: [] };
    }
  }, []);

  if (allNodes.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#737373' }}>
        <p>Mind map data tidak ditemukan.</p>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <MindMapInner allNodes={allNodes} allEdges={allEdges} />
    </ReactFlowProvider>
  );
}
