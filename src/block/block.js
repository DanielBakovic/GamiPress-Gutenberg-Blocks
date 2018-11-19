/**
 * GamiPress Gutenberg Blocks
 *
 * @since 1.0.0
 */

// Import CSS
import './style.scss';
import './editor.scss';

// React dependencies
import React from 'react';
import Select from 'react-select';
import AsyncSelect from 'react-select/lib/Async';

// WordPress dependencies
const { __ } = wp.i18n;
const { registerBlockType } = wp.blocks;
const { InspectorControls  } = wp.editor;
const { createElement  } = wp.element;
const { apiFetch } = wp;
const { addQueryArgs } = wp.url;
const {
    ServerSideRender,
    PanelBody,
    PanelRow,
    BaseControl,
    ToggleControl,
    RadioControl,
    SelectControl,
    TextControl,
    TextareaControl ,
} = wp.components;

// Custom vars
let posts_cache = [];
let users_cache = [];

Object.keys(gamipress_blocks.shortcodes).map(function( slug ) {

    let shortcode = gamipress_blocks.shortcodes[slug];

    if( shortcode === undefined ) return true;

    // Block name requires to be a prefix/block-slug
    // So let's turn gamipress_points_types to gamipress/points-types
    let block_name = shortcode.slug.replace( 'gamipress_', 'gamipress/' ).replace( new RegExp('_', 'g'), '-' );

    /**
     * Register a GamiPress shortcode as a Gutenberg block
     *
     * @since   1.0.0
     *
     * @param  {string}   name      Block name
     * @param  {Object}   settings  Block settings
     *
     * @return {?WPBlock}           The block, if it has been successfully registered; otherwise `undefined`
     */
    registerBlockType( block_name, {
        title: shortcode.name,
        icon: gamipress_blocks_get_icon( shortcode.icon ),
        category: 'gamipress',
        keywords: [
            'gamipress',
        ],
        attributes: shortcode.attributes,
        edit: function( props ) {

            const { name, attributes, setAttributes, className } = props;

            let slug = className.replace( 'wp-block-gamipress-', 'gamipress_' ).replace( new RegExp('-', 'g'), '_' );
            let shortcode = gamipress_blocks.shortcodes[slug];
            let form = [];
            let fields = [];
            let tabs_ids = Object.keys(shortcode.tabs);

            if( tabs_ids.length ) {

                // Render the form with tabs (as PanelBody elements)
                tabs_ids.map(function( tab_id ) {

                    let tab = shortcode.tabs[tab_id];

                    // Render tab fields
                    Object.keys(tab.fields).forEach(function( i ) {
                        let field_id = tab.fields[i];
                        let field = shortcode.fields[field_id];

                        // Avoid issues with removed fields that keep their id on a tab
                        if( field !== undefined ) {
                            field.id = field_id;

                            fields.push( gamipress_blocks_get_field_html( field, props ) );
                        }
                    });

                    // Add tab fields to the tab
                    form.push(
                        <PanelBody title={ tab.title }>
                            {fields}
                        </PanelBody>
                    );

                })

            } else {

                // Render fields
                Object.keys(shortcode.fields).map(function( field_id ) {
                    let field = shortcode.fields[field_id];

                    // Avoid issues with removed fields
                    if( field !== undefined ) {
                        field.id = field_id;

                        fields.push( gamipress_blocks_get_field_html( field, props ) );
                    }
                });

                // Add fields to a PanelBoddy
                form.push(
                    <PanelBody title={ __( 'Settings' ) }>
                        {fields}
                    </PanelBody>
                );

            }

            return (
                <div className={ className }>
                    <ServerSideRender
                        block={ name }
                        attributes={ attributes }
                    />
                    <InspectorControls>
                        <div className={ 'gamipress-inspector-controls ' + className }>
                            {form}
                        </div>
                    </InspectorControls>
                </div>
            );
        },
        save: function( props ) {
            // Rendered on server
            return null;
        },
    } );

});

/**
 * Get the icon identifier or SVG from a given identifier
 *
 * @since   1.0.0
 * @updated 1.0.1 Take icons from server side localized vars
 *
 * @param  {string}   icon      Icon identifier
 *
 * @return {string}             Icon identifier or SVG element
 */
function gamipress_blocks_get_icon( icon ) {

    if( icon === undefined )
        icon = 'gamipress';

    // Check if icon has been registered (check gamipress_get_block_icons() function)
    if( gamipress_blocks.icons[icon] !== undefined ) {
        return ( <span dangerouslySetInnerHTML={{__html: gamipress_blocks.icons[icon]}}></span> ) ;
    }

    return icon;

}

/**
 * Build the field HTML from his object
 *
 * @since   1.0.0
 *
 * @param  {Object}   field     Field object
 * @param  {Object}   props     Block properties
 *
 * @return {string}             Field HTML
 */
function gamipress_blocks_get_field_html( field, props ) {

    if( field === undefined ) return '';

    const { name, attributes, setAttributes, className } = props;

    let field_args = {};

    // Check field visibility
    if( ! gamipress_blocks_is_visible( field, attributes ) ) {
        return '';
    }

    // Common field args
    field_args.id       = field.id;
    field_args.label    = field.name;
    field_args.help     = ( field.description !== undefined ? field.description : field.desc );
    field_args.value    = gamipress_blocks_get_field_value( field, attributes );
    field_args.onChange = ( value ) => setAttributes({ [field.id]: value });

    if( field.type === 'checkbox' ) {

        // Checkbox
        field_args.checked = attributes[field.id] === true || ( attributes[field.id] === undefined && field.default === 'yes' );

    } else if( ( field.type === 'select' || field.type === 'advanced_select' ) && field.options !== undefined && Object.keys(field.options).length ) {

        // Select
        field_args.options = gamipress_blocks_get_field_options( field, false );
        field_args.isMulti = ( field.multiple !== undefined ? field.multiple : false );

        // React-select specific args
        if( field.multiple !== undefined && field.multiple ) {

            field_args.onChange = ( value ) => setAttributes({
                // Map json value to just return the 'value' key as a comma-separated list of values
                [field.id]: value.map(function(option) {
                    return option.value;
                }).join(',')
            });
        }

    } else if( field.type === 'post' || field.type === 'user' ) {

        // AsyncSelect
        field_args.isMulti = ( field.multiple !== undefined ? field.multiple : false );
        field_args.loadOptions = ( value, callback ) => {
            gamipress_blocks_load_options( field, value, callback );
        };

        if( field.multiple !== undefined && field.multiple ) {

            field_args.onChange = ( value ) => setAttributes({
                // Map object value to just return the 'value' key as a comma-separated list of values
                [field.id]: value.map(function(option) {
                    return option.value;
                }).join(',')
            });

        } else {

            // get the 'value' key from selected option
            field_args.onChange = ( value ) => setAttributes({
                [field.id]: ( value ? value.value : null )
            });
        }

    } else if( field.type === 'radio' && field.options !== undefined ) {

        // Radio
        field_args.options = gamipress_blocks_get_field_options( field, true );
        field_args.selected = ( attributes[field.id] === undefined && field.default !== undefined ? field.default : attributes[field.id] );

    }

    // Allow HTML on field help
    if( field_args.help !== undefined && field_args.help.length ) {
        field_args.help = ( <span dangerouslySetInnerHTML={{__html: field_args.help}}></span> )
    }

    // Generate the field HTML
    let field_html = createElement(
        gamipress_blocks_get_field_control( field ),
        field_args
    );

    // Let's check if requires a row
    let requires_row = (
        // Select multiple requires row
        ( ( field.type === 'select' || field.type === 'advanced_select' ) && ( field.multiple !== undefined && field.multiple ) )
        // AsyncSelect requires row
        || ( field.type === 'post' || field.type === 'user' )
    );

    if( requires_row ) {

        // Return the field HTML wrapped on an BaseControl element
        return createElement(
            BaseControl,
            field_args,
            field_html
        );

    }

    // Return the field HTML
    return field_html;

}

/**
 * Get the appropriated component for given field type
 *
 * @since   1.0.0
 *
 * @param  {Object}   field     Field object
 *
 * @return {wp.components}      Field Component
 */
function gamipress_blocks_get_field_control( field ) {

    switch ( field.type ) {
        case 'checkbox':
            return ToggleControl;
        case 'select':
        case 'advanced_select':
            if( field.options !== undefined && Object.keys(field.options).length ) {

                if( field.multiple !== undefined && field.multiple ) {
                    return Select;
                } else {
                    return SelectControl;
                }

            } else {
                return TextControl;
            }
        case 'post':
        case 'user':
            return AsyncSelect;
        case 'radio':
            if( field.options !== undefined && Object.keys(field.options).length ) {
                return RadioControl;
            } else {
                return TextControl;
            }
        case 'textarea':
            return TextareaControl;
        default:
            return TextControl;
    }

}

/**
 * Build a option object from field object
 *
 * @since   1.0.0
 *
 * @param  {Object}   field         Field object
 * @param  {boolean}  allow_html    Allow HTML on option label, by default false
 *
 * @return {Object}                 Option object
 */
function gamipress_blocks_get_field_options( field, allow_html ) {

    if( allow_html === undefined )
        allow_html = false;

    let options = [];

    Object.keys(field.options).map(function( option_value ) {

        let option_label = field.options[option_value];

        if( allow_html ) {
            // Accept HTML in option labels
            option_label = ( <span dangerouslySetInnerHTML={{__html: option_label}}></span> );
        }

        options.push( {
            value: option_value, label: option_label
        } );
    });

    return options;

}

/**
 * Setup the field value attribute
 *
 * @since   1.0.0
 *
 * @param  {Object}   field         Field object
 * @param  {Object}   attributes    Field attributes
 *
 * @return {Object}                 Current field value
 */
function gamipress_blocks_get_field_value( field, attributes ) {

    if( ( field.type === 'select' || field.type === 'advanced_select' ) && field.options !== undefined && Object.keys(field.options).length ) {

        // React-select specific args
        if( field.multiple !== undefined && field.multiple ) {

            if( attributes[field.id] ) {

                // Split the comma-separated value and build an object  from the field options
                return attributes[field.id].split(',').map(function(option) {
                    return { value: option, label: field.options[option] }
                })
            }

            // React-select multiple requires return null when empty
            return null;

        }

    } else if( field.type === 'post' || field.type === 'user' ) {

        if( field.multiple !== undefined && field.multiple ) {

            if( attributes[field.id] ) {

                // Split the comma-separated value and build an object  from the field options
                return attributes[field.id].split(',').map(function(option) {
                    return gamipress_blocks_get_item_option( option, field );
                })
            }

            // React-select multiple requires return null when empty
            return null;

        } else {

            if( attributes[field.id] ) {

                return gamipress_blocks_get_item_option( attributes[field.id], field );

            }

            // React-select multiple requires return null when empty
            return null;

        }

    }

    // Common field value
    return attributes[field.id];

}

/**
 * Helper function to build a option object from the item value give
 * Note. This function is user for AsyncSelect component mainly
 *
 * @since   1.0.0
 *
 * @param  {string}   value         Option value
 * @param  {Object}   field         Field object
 *
 * @return {Object}                 Option object a: { value: '', label: '' }
 */
function gamipress_blocks_get_item_option( value, field ) {

    // There is many ways value can come from
    if( field.options[value] !== undefined ) {

        // From field.options
        return { value: value, label: field.options[value] };

    } else if( field.type === 'post' ) {

        if( posts_cache[value] !== undefined ) {
            // From cached posts results
            return { value: value, label: posts_cache[value].title.rendered + ' (#' + value + ')' };
        } else {
            // Fallback for initial load
            return { value: value, label: 'Post (#' + value + ')' };
        }

    } else if( field.type === 'user' && users_cache[value] !== undefined ) {

        if( users_cache[value] !== undefined ) {
            // From cached users results
            return { value: value, label: users_cache[value].name + ' (#' + value + ')' };
        } else {
            // Fallback for initial load
            return { value: value, label: 'User (#' + value + ')' };
        }
    }

    return null;

}

/**
 * Setup the field value attribute
 *
 * @since   1.0.0
 *
 * @param  {Object}   field         Field object
 * @param  {String}   value         Search term
 * @param  {Function} callback      Callback to render results
 */
function gamipress_blocks_load_options( field, value, callback ) {

    let url = '/wp/v2/';
    let query_args = {
        search: value,
        per_page: 20,
    };

    if( field.type === 'post' ) {

        // WP Rest API just support 1 post type, so let's use a custom endpoint
        url += 'gamipress-posts';

        // Type query arg

        query_args.type = 'post';

        if( field.post_type !== undefined ) {

            if( Array.isArray( field.post_type ) ) {
                query_args.type = field.post_type.join(',');
            } else {
                query_args.type = field.post_type;
            }

            query_args.type = field.post_type;
        }

    } else if( field.type === 'user' ) {

        url += 'users';

    }

    // Create the request to WP Rest API
    const request = apiFetch({ path: addQueryArgs( url, query_args ) });

    request.then( results => {

        let options = [];

        results.map(function(result) {

            if( field.type === 'post' ) {

                let post_type_label = result.type;

                if( gamipress_blocks.post_type_labels[result.type] !== undefined ) {
                    post_type_label = gamipress_blocks.post_type_labels[result.type];
                }

                // Post option
                options.push( {
                    value: result.id,
                    label: (
                        <span className="gamipress-result" >
                                    <strong>{result.title.rendered}</strong>
                                    <span className="gamipress-result-description" >
                                        ID: {result.id}
                                        <span className="align-right">{post_type_label}</span>
                                    </span>
                                </span>
                    )
                } );

                // Store result on cache
                posts_cache[result.id] = result;

            } else if( field.type === 'user' ) {

                // Select option
                options.push( {
                    value: result.id,
                    label: (
                        <span className="gamipress-result" >
                                    <strong>{result.name}</strong>
                                    <span className="gamipress-result-description" >
                                        ID: {result.id}
                                    </span>
                                </span>
                    )
                } );

                // Store result on cache
                users_cache[result.id] = result;

            }
        });

        callback( options );

    }).catch(() => {

        callback( [] );

    });

}

/**
 * Check if given field is visible
 *
 * @since   1.0.0
 *
 * @param  {Object}   field         Field object
 * @param  {Object}   attributes    Block attributes
 *
 * @return {boolean}
 */
function gamipress_blocks_is_visible( field, attributes ) {

    let is_visible = true;

    if( field.conditions !== undefined ) {

        let relation = 'AND';

        if( field.conditions.relation !== undefined && field.conditions.relation.toUpperCase() === 'OR' ) {
            relation = 'OR';
            is_visible = false; // Initialize is_visible as false since relation is less restrictive
        }

        Object.keys(field.conditions).map(function( field_id ) {

            // Skip relation index
            if( field_id === 'relation' && attributes[field_id] === undefined ) {
                return true;
            }

            // By default, get values as is a field has been defined in short way as:
            // array(
            //      'field_id' => 'value',
            // )
            let required_value = field.conditions[field_id];
            let value = attributes[field_id];
            let compare = '=';

            // Check if condition has been defined as:
            // array(
            //      'field_id' => '',
            //      'value' => '',
            //      'compare' => '',
            // )
            if( Array.isArray( required_value ) && required_value['field_id'] !== undefined ) {

                field_id = required_value['field_id'];
                required_value = required_value['value'];
                value = attributes[field_id]; // Refresh values since field id has been updated

                if( required_value['compare'] !== undefined ) {
                    compare = required_value['compare'];
                }

            }

            switch( compare ) {
                case '=':
                case '==':
                case '===':
                    if( relation === 'OR' )
                        is_visible = is_visible || ( value === required_value );
                    else
                        is_visible = is_visible && ( value === required_value );
                    break;
                case '!=':
                case '!==':
                    if( relation === 'OR' )
                        is_visible = is_visible || ( value !== required_value );
                    else
                        is_visible = is_visible && ( value !== required_value );
                    break;
                case '>':
                    if( relation === 'OR' )
                        is_visible = is_visible || ( value > required_value );
                    else
                        is_visible = is_visible && ( value > required_value );
                    break;
                case '<':
                    if( relation === 'OR' )
                        is_visible = is_visible || ( value < required_value );
                    else
                        is_visible = is_visible && ( value < required_value );
                    break;
                case '>=':
                    if( relation === 'OR' )
                        is_visible = is_visible || ( value >= required_value );
                    else
                        is_visible = is_visible && ( value >= required_value );
                    is_visible = is_visible && ( value >= required_value );
                    break;
                case '<=':
                    if( relation === 'OR' )
                        is_visible = is_visible || ( value <= required_value );
                    else
                        is_visible = is_visible && ( value <= required_value );
                    break;
            }

        });
    }

    return is_visible;
}
