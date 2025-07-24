// web-search-agent.ts
import { 
  BotAgent, 
  ManifestOptions, 
  UtteranceEvent, 
  Envelope,
  createTextUtterance,
  isUtteranceEvent
} from '@openfloor/protocol';

/**
 * WebSearchAgent - General web search agent using DuckDuckGo
 */
export class WebSearchAgent extends BotAgent {
  private readonly rateLimitDelay = 2000; // 2 seconds
  private lastRequestTime = 0;

  constructor(manifest: ManifestOptions) {
    super(manifest);
  }

  async processEnvelope(inEnvelope: Envelope): Promise<Envelope> {
    const responseEvents: any[] = [];

    for (const event of inEnvelope.events) {
      const addressedToMe = !event.to || 
        event.to.speakerUri === this.speakerUri || 
        event.to.serviceUrl === this.serviceUrl ||
        (event.to.serviceUrl && event.to.serviceUrl.includes('localhost'));

      if (addressedToMe && isUtteranceEvent(event)) {
        const responseEvent = await this._handleWebQuery(event, inEnvelope);
        if (responseEvent) responseEvents.push(responseEvent);
      } else if (addressedToMe && event.eventType === 'getManifests') {
        const manifestData = {
          identification: {
            speakerUri: this.speakerUri,
            serviceUrl: this.serviceUrl,
            organization: 'OpenFloor Research',
            conversationalName: 'Web Search Agent',
            synopsis: 'Web search specialist for current information, news, guides, and general web content'
          },
          capabilities: [
            {
              keyphrases: [
                'web search', 'news', 'current', 'latest', 'how to',
                'guide', 'tutorial', 'what is', 'information', 'recent'
              ],
              descriptions: [
                'Search the web for current information and news',
                'Find guides, tutorials, and how-to information',
                'Provide general web search results and overviews'
              ]
            }
          ]
        };

        responseEvents.push({
          eventType: 'publishManifests',
          to: { speakerUri: inEnvelope.sender.speakerUri },
          parameters: {
            servicingManifests: [manifestData]
          }
        });
      }
    }

    return new Envelope({
      schema: { version: inEnvelope.schema.version },
      conversation: { id: inEnvelope.conversation.id },
      sender: {
        speakerUri: this.speakerUri,
        serviceUrl: this.serviceUrl
      },
      events: responseEvents
    });
  }

  private async _handleWebQuery(event: UtteranceEvent, inEnvelope: Envelope): Promise<any> {
    try {
      const dialogEvent = event.parameters?.dialogEvent as { features?: any };
      if (!dialogEvent?.features?.text?.tokens?.length) {
        return createTextUtterance({
          speakerUri: this.speakerUri,
          text: "🌐 I need a search query to find current information on the web!",
          to: { speakerUri: inEnvelope.sender.speakerUri }
        });
      }

      const query = dialogEvent.features.text.tokens
        .map((token: any) => token.value)
        .join('');

      const results = await this._performWebSearch(query);
      
      return createTextUtterance({
        speakerUri: this.speakerUri,
        text: results,
        to: { speakerUri: inEnvelope.sender.speakerUri }
      });

    } catch (error) {
      console.error('Error in web search:', error);
      return createTextUtterance({
        speakerUri: this.speakerUri,
        text: "🌐 I encountered an error while searching the web. Please try again with a different search query.",
        to: { speakerUri: inEnvelope.sender.speakerUri }
      });
    }
  }

  private async _performWebSearch(query: string): Promise<string> {
    await this._rateLimit();
    return await this._searchDuckDuckGo(query);
  }

  private async _searchDuckDuckGo(query: string): Promise<string> {
    const instantAnswerUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    
    const response = await fetch(instantAnswerUrl, {
      headers: {
        'User-Agent': 'OpenFloor Web Search Agent (search@openfloor.org)'
      }
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo API error: ${response.status}`);
    }

    const data = await response.json() as any;
    
    let result = `**Web Search Results for: ${query}**\n\n`;

    // Extract instant answer
    if (data.Abstract) {
      result += `**Summary:**\n${data.Abstract}\n\n`;
      if (data.AbstractSource) {
        result += `Source: ${data.AbstractSource}\n`;
      }
      if (data.AbstractURL) {
        result += `More info: ${data.AbstractURL}\n\n`;
      }
    }

    // Extract definition
    if (data.Definition) {
      result += `**Definition:**\n${data.Definition}\n`;
      if (data.DefinitionSource) {
        result += `Source: ${data.DefinitionSource}\n`;
      }
      if (data.DefinitionURL) {
        result += `More info: ${data.DefinitionURL}\n\n`;
      }
    }

    // Extract related topics
    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      result += `**Related Information:**\n`;
      data.RelatedTopics.slice(0, 3).forEach((topic: any, index: number) => {
        if (topic.Text) {
          result += `${index + 1}. ${topic.Text}\n`;
          if (topic.FirstURL) {
            result += `   Link: ${topic.FirstURL}\n`;
          }
        }
      });
      result += `\n`;
    }

    // Extract infobox data
    if (data.Infobox && data.Infobox.content && data.Infobox.content.length > 0) {
      result += `**Key Information:**\n`;
      data.Infobox.content.slice(0, 5).forEach((item: any) => {
        if (item.label && item.value) {
          result += `• ${item.label}: ${item.value}\n`;
        }
      });
      result += `\n`;
    }

    // If no results found
    if (!data.Abstract && !data.Definition && (!data.RelatedTopics || data.RelatedTopics.length === 0) && (!data.Infobox || !data.Infobox.content || data.Infobox.content.length === 0)) {
      throw new Error(`No search results found for: ${query}`);
    }

    return result;
  }

  private async _rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const waitTime = this.rateLimitDelay - timeSinceLastRequest;
    
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }
}

export function createWebSearchAgent(options: {
  speakerUri: string;
  serviceUrl: string;
  name?: string;
  organization?: string;
}): WebSearchAgent {
  const {
    speakerUri,
    serviceUrl,
    name = 'Web Search Agent',
    organization = 'OpenFloor Research'
  } = options;

  const manifest: ManifestOptions = {
    identification: {
      speakerUri,
      serviceUrl,
      organization,
      conversationalName: name,
      synopsis: 'Web search specialist for current information, news, guides, and general web content'
    },
    capabilities: [
      {
        keyphrases: [
          'web search', 'news', 'current', 'latest', 'how to',
          'guide', 'tutorial', 'what is', 'information', 'recent'
        ],
        descriptions: [
          'Search the web for current information and news',
          'Find guides, tutorials, and how-to information',
          'Provide general web search results and overviews'
        ]
      }
    ]
  };

  return new WebSearchAgent(manifest);
}